from datetime import datetime, timezone
from flask import current_app
from app import db, socketio
from app.models.conversation import Conversation, ConversationParticipant, Message
from app.models.user import User


def membership(conversation_id, user_id):
    return ConversationParticipant.query.filter_by(conversation_id=conversation_id, user_id=user_id).first()


def utc_isoformat(value):
    """Serialize database timestamps using the app's UTC storage convention."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


def emit_to_conversation_members(conversation_id, event, payload):
    """Deliver realtime events only to users who are current members."""
    member_ids = db.session.query(ConversationParticipant.user_id).filter_by(
        conversation_id=conversation_id,
    ).all()
    for (user_id,) in member_ids:
        try:
            socketio.emit(event, payload, to=f'user:{user_id}')
        except Exception:
            current_app.logger.exception('Realtime event delivery failed after conversation data was saved')


def emit_to_user(user_id, event, payload):
    try:
        socketio.emit(event, payload, to=f'user:{user_id}')
    except Exception:
        current_app.logger.exception('Realtime event delivery failed after account data was saved')


def record_group_system_events(conversation_id, actor_id, events):
    """Persist and broadcast group-detail changes as system messages."""
    if not events:
        return []
    conversation = db.session.get(Conversation, conversation_id)
    if not conversation or conversation.kind != 'group' or not membership(conversation_id, actor_id):
        return []
    messages = [Message(
        conversation_id=conversation_id,
        sender_id=actor_id,
        body=body,
        system_event=event_type,
    ) for event_type, body in events]
    try:
        db.session.add_all(messages)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception('Could not record group update notices')
        return []
    for message in messages:
        emit_to_conversation_members(conversation_id, 'new_message', message_dict(message))
    return messages


def add_message(conversation_id, sender_id, body, reply_to_id=None):
    if reply_to_id is not None and (isinstance(reply_to_id, bool) or not isinstance(reply_to_id, int)):
        return None, 'Invalid reply target'
    if not isinstance(body, str) or (not body.strip() and reply_to_id is None):
        return None, 'Message cannot be empty'
    if len(body.strip()) > 5000:
        return None, 'Messages must be 5,000 characters or fewer'
    if not membership(conversation_id, sender_id):
        return None, 'Conversation not found', 404
    reply = db.session.get(Message, reply_to_id) if reply_to_id is not None else None
    if reply_to_id is not None and (not reply or reply.conversation_id != conversation_id):
        return None, 'Reply target was not found in this conversation'
    message = Message(conversation_id=conversation_id, sender_id=sender_id, body=body.strip(), reply_to=reply)
    db.session.add(message)
    db.session.commit()
    return message, None


def message_delivery_status(message):
    """Return a WhatsApp-style receipt state for outgoing direct messages."""
    if message.conversation.kind != 'direct':
        return None
    recipient = next((participant for participant in message.conversation.participants
                      if participant.user_id != message.sender_id), None)
    if not recipient:
        return 'sent'
    if recipient.last_read_message_id and recipient.last_read_message_id >= message.id:
        return 'seen'
    if recipient.last_read_at and message.created_at:
        read_at = recipient.last_read_at
        created_at = message.created_at
        if read_at.tzinfo is None and created_at.tzinfo is not None:
            read_at = read_at.replace(tzinfo=created_at.tzinfo)
        elif created_at.tzinfo is None and read_at.tzinfo is not None:
            created_at = created_at.replace(tzinfo=read_at.tzinfo)
        if read_at >= created_at:
            return 'seen'
    if recipient.last_delivered_message_id and recipient.last_delivered_message_id >= message.id:
        return 'delivered'
    return 'sent'


def group_message_receipts(message, viewer_id):
    """Return each other group member's latest receipt state for a message."""
    receipts = []
    for participant in message.conversation.participants:
        if participant.user_id == viewer_id:
            continue
        is_read = bool(participant.last_read_message_id and participant.last_read_message_id >= message.id)
        if not is_read and participant.last_read_at and message.created_at:
            read_at = participant.last_read_at
            created_at = message.created_at
            if read_at.tzinfo is None and created_at.tzinfo is not None:
                read_at = read_at.replace(tzinfo=created_at.tzinfo)
            elif created_at.tzinfo is None and read_at.tzinfo is not None:
                created_at = created_at.replace(tzinfo=read_at.tzinfo)
            is_read = read_at >= created_at
        if is_read:
            status = 'read'
        elif participant.last_delivered_message_id and participant.last_delivered_message_id >= message.id:
            status = 'delivered'
        else:
            status = 'sent'
        user = participant.user
        receipts.append({
            'user_id': user.id,
            'display_name': user.display_name or user.username,
            'username': user.username,
            'status': status,
        })
    return receipts


def message_dict(message):
    return {
        'id': message.id,
        'conversation_id': message.conversation_id,
        'body': message.body,
        'system_event': message.system_event,
        'reply_to': ({'id': message.reply_to.id, 'body': message.reply_to.body,
                      'sender': message.reply_to.sender.display_name or message.reply_to.sender.username}
                     if message.reply_to else None),
        'created_at': utc_isoformat(message.created_at),
        'delivery_status': message_delivery_status(message),
        'media': [item.to_dict() for item in message.media],
        'sender': {
            'id': message.sender.id,
            'username': message.sender.username,
            'display_name': message.sender.display_name or message.sender.username,
            'avatar_url': message.sender.avatar_url,
        },
    }


def conversation_dict(conversation, viewer_id, include_last_message=True):
    participants = sorted(conversation.participants, key=lambda item: item.joined_at)
    others = [p.user for p in participants if p.user_id != viewer_id]
    last_message = Message.query.filter_by(conversation_id=conversation.id).order_by(Message.created_at.desc(), Message.id.desc()).first()
    viewer = next((participant for participant in participants if participant.user_id == viewer_id), None)
    unread_query = Message.query.filter(
        Message.conversation_id == conversation.id,
        Message.sender_id != viewer_id,
    )
    if viewer and viewer.last_read_at:
        unread_query = unread_query.filter(Message.created_at > viewer.last_read_at)
    return {
        'id': conversation.id,
        'kind': conversation.kind,
        'name': conversation.name,
        'description': conversation.description or '',
        'avatar_url': (f'/api/conversations/{conversation.id}/group-avatar/{conversation.avatar_filename}'
                       if conversation.kind == 'group' and conversation.avatar_filename else None),
        'title': conversation.name or ', '.join((u.display_name or u.username) for u in others),
        'created_at': utc_isoformat(conversation.created_at),
        'participants': [
            {'id': p.user_id, 'username': p.user.username, 'display_name': p.user.display_name or p.user.username,
             'avatar_url': p.user.avatar_url, 'biography': p.user.biography,
             'instagram_url': p.user.instagram_url, 'role': p.role}
            for p in participants
        ],
        'last_message': message_dict(last_message) if include_last_message and last_message else None,
        'unread_count': unread_query.count(),
    }


def create_direct(user_id, other_id):
    if user_id == other_id:
        return None, 'You cannot start a conversation with yourself', 400
    if not db.session.get(User, other_id):
        return None, 'User not found', 404
    key = ':'.join(map(str, sorted((user_id, other_id))))
    conversation = Conversation.query.filter_by(kind='direct', direct_key=key).first()
    if conversation:
        return conversation, None, 200
    conversation = Conversation(kind='direct', direct_key=key, created_by_id=user_id)
    db.session.add(conversation)
    db.session.flush()
    db.session.add_all([
        ConversationParticipant(conversation_id=conversation.id, user_id=user_id, role='admin'),
        ConversationParticipant(conversation_id=conversation.id, user_id=other_id, role='member'),
    ])
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        conversation = Conversation.query.filter_by(kind='direct', direct_key=key).first()
        if conversation:
            return conversation, None, 200
        raise
    return conversation, None, 201


def create_group(creator_id, name, member_ids, description=''):
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
        return None, 'Group name must be between 1 and 100 characters', 400
    if description is None:
        description = ''
    if not isinstance(description, str) or len(description.strip()) > 500:
        return None, 'Group description must be 500 characters or fewer', 400
    if not isinstance(member_ids, list) or len(member_ids) > 29:
        return None, 'Add between 1 and 29 other members', 400
    if any(isinstance(user_id, bool) or not isinstance(user_id, int) for user_id in member_ids):
        return None, 'Member IDs must be whole numbers', 400
    try:
        ids = set(member_ids) | {creator_id}
    except TypeError:
        return None, 'Member IDs must be whole numbers', 400
    users = User.query.filter(User.id.in_(ids)).all()
    if len(users) != len(ids):
        return None, 'One or more users were not found', 404
    if len(ids) < 2:
        return None, 'A group needs at least one other member', 400
    conversation = Conversation(kind='group', name=name.strip(), description=description.strip() or None,
                                created_by_id=creator_id)
    db.session.add(conversation)
    db.session.flush()
    db.session.add_all([
        ConversationParticipant(conversation_id=conversation.id, user_id=user_id,
                                role='admin' if user_id == creator_id else 'member')
        for user_id in ids
    ])
    db.session.commit()
    return conversation, None, 201


def add_group_members(conversation, member_ids):
    if conversation.kind != 'group':
        return 'Participants can only be added to a group conversation', 400
    if not isinstance(member_ids, list) or not member_ids or len(member_ids) > 29:
        return 'Provide between 1 and 29 member IDs', 400
    if any(isinstance(user_id, bool) or not isinstance(user_id, int) for user_id in member_ids):
        return 'Member IDs must be whole numbers', 400
    unique_ids = set(member_ids)
    users = User.query.filter(User.id.in_(unique_ids)).all()
    if len(users) != len(unique_ids):
        return 'One or more users were not found', 404
    current = {p.user_id for p in conversation.participants}
    if len(current | unique_ids) > 30:
        return 'Groups can have at most 30 members', 400
    db.session.add_all(ConversationParticipant(conversation_id=conversation.id, user_id=user_id, role='member')
                       for user_id in unique_ids - current)
    db.session.commit()
    return None, None


def remove_group_member(conversation, user_id):
    if conversation.kind != 'group':
        return 'Participants can only be removed from a group conversation', 400
    participant = membership(conversation.id, user_id)
    if not participant:
        return 'Member not found', 404
    if participant.role == 'admin' and sum(p.role == 'admin' for p in conversation.participants) == 1:
        replacement = next((p for p in conversation.participants if p.user_id != user_id), None)
        if replacement:
            replacement.role = 'admin'
    db.session.delete(participant)
    db.session.commit()
    return None, None


def leave_group(conversation, user_id):
    if conversation.kind != 'group':
        return 'Only group conversations can be left', 400
    participant = membership(conversation.id, user_id)
    if not participant:
        return 'Conversation not found', 404
    if participant.role == 'admin' and sum(p.role == 'admin' for p in conversation.participants) == 1:
        replacement = next((p for p in conversation.participants if p.user_id != user_id), None)
        if replacement:
            replacement.role = 'admin'
    db.session.delete(participant)
    if len(conversation.participants) <= 1:
        db.session.delete(conversation)
    db.session.commit()
    return None, None


def rename_group(conversation, user_id, new_name):
    return update_group_details(conversation, user_id, new_name, conversation.description or '')


def update_group_details(conversation, user_id, new_name, description):
    if conversation.kind != 'group':
        return 'Only group details can be changed', 400
    participant = membership(conversation.id, user_id)
    if not participant:
        return 'Conversation not found', 404
    if participant.role != 'admin':
        return 'Only group administrators can edit group details', 403
    if not isinstance(new_name, str) or not new_name.strip() or len(new_name.strip()) > 100:
        return 'Group name must be between 1 and 100 characters', 400
    if not isinstance(description, str) or len(description.strip()) > 500:
        return 'Group description must be 500 characters or fewer', 400
    conversation.name = new_name.strip()
    conversation.description = description.strip() or None
    conversation.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return None, None


def update_group_member_role(conversation, user_id, role):
    if conversation.kind != 'group':
        return 'Only group members have group roles', 400
    participant = membership(conversation.id, user_id)
    if not participant:
        return 'Member not found', 404
    if not isinstance(role, str) or role not in {'admin', 'member'}:
        return 'Role must be admin or member', 400
    if participant.role == 'admin' and role == 'member':
        admin_count = sum(item.role == 'admin' for item in conversation.participants)
        if admin_count <= 1:
            return 'A group must keep at least one administrator', 400
    participant.role = role
    conversation.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return None, None


def mark_read(conversation_id, user_id):
    participant = membership(conversation_id, user_id)
    if participant:
        participant.last_read_at = datetime.now(timezone.utc)
        latest_message_id = db.session.query(db.func.max(Message.id)).filter_by(conversation_id=conversation_id).scalar()
        if latest_message_id and (participant.last_read_message_id is None or latest_message_id > participant.last_read_message_id):
            participant.last_read_message_id = latest_message_id
        if latest_message_id and (participant.last_delivered_message_id is None or latest_message_id > participant.last_delivered_message_id):
            participant.last_delivered_message_id = latest_message_id
        db.session.commit()
        if latest_message_id:
            emit_to_conversation_members(conversation_id, 'message_receipt', {
                'conversation_id': conversation_id,
                'user_id': user_id,
                'through_message_id': latest_message_id,
                'status': 'seen',
            })
    return participant


def mark_delivered(conversation_id, user_id, message_id):
    participant = membership(conversation_id, user_id)
    message = db.session.get(Message, message_id)
    if not participant or not message or message.conversation_id != conversation_id or message.sender_id == user_id:
        return None
    if participant.last_read_message_id and participant.last_read_message_id >= message_id:
        status = 'seen'
        through_message_id = participant.last_read_message_id
    else:
        status = 'delivered'
        if participant.last_delivered_message_id is None or message_id > participant.last_delivered_message_id:
            participant.last_delivered_message_id = message_id
            db.session.commit()
        through_message_id = participant.last_delivered_message_id
    emit_to_conversation_members(conversation_id, 'message_receipt', {
        'conversation_id': conversation_id,
        'user_id': user_id,
        'through_message_id': through_message_id,
        'status': status,
    })
    return status
