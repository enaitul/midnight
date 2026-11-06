from flask import Blueprint, g, jsonify, request
from app import db
from app.models.conversation import Conversation, ConversationParticipant, Message
from app.services.conversation_service import (
    add_group_members, add_message, conversation_dict, leave_group, mark_read,
    membership, message_dict, remove_group_member, rename_group, create_direct, create_group,
    emit_to_conversation_members, emit_to_user,
)
from app.utils.auth_middleware import token_required

conversations_bp = Blueprint('conversations', __name__, url_prefix='/api/conversations')


def _authorized_conversation(conversation_id):
    conversation = db.session.get(Conversation, conversation_id)
    if not conversation or not membership(conversation_id, g.current_user.id):
        return None
    return conversation


@conversations_bp.get('')
@token_required
def list_conversations():
    conversations = Conversation.query.join(ConversationParticipant).filter(
        ConversationParticipant.user_id == g.current_user.id,
    ).all()
    items = [conversation_dict(item, g.current_user.id) for item in conversations]
    items.sort(key=lambda item: item['last_message']['created_at'] if item['last_message'] else item['created_at'], reverse=True)
    return jsonify({'conversations': items}), 200


@conversations_bp.post('/direct')
@token_required
def start_direct():
    data = request.get_json(silent=True) or {}
    other_id = data.get('user_id')
    if isinstance(other_id, bool) or not isinstance(other_id, int):
        return jsonify({'error': 'user_id must be a whole number'}), 400
    conversation, error, status = create_direct(g.current_user.id, other_id)
    if error:
        return jsonify({'error': error}), status
    return jsonify({'conversation': conversation_dict(conversation, g.current_user.id)}), status


@conversations_bp.post('/groups')
@token_required
def start_group():
    data = request.get_json(silent=True) or {}
    conversation, error, status = create_group(g.current_user.id, data.get('name'), data.get('member_ids'))
    if error:
        return jsonify({'error': error}), status
    return jsonify({'conversation': conversation_dict(conversation, g.current_user.id)}), status


@conversations_bp.get('/<int:conversation_id>')
@token_required
def get_conversation(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404
    return jsonify({'conversation': conversation_dict(conversation, g.current_user.id)}), 200


@conversations_bp.get('/<int:conversation_id>/messages')
@token_required
def get_messages(conversation_id):
    if not _authorized_conversation(conversation_id):
        return jsonify({'error': 'Conversation not found'}), 404
    limit = min(max(request.args.get('limit', 100, type=int), 1), 200)
    query = Message.query.filter_by(conversation_id=conversation_id)
    before_id = request.args.get('before', type=int)
    if before_id:
        query = query.filter(Message.id < before_id)
    rows = query.order_by(Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = list(reversed(rows[:limit]))
    return jsonify({'messages': [message_dict(item) for item in rows], 'has_more': has_more}), 200


@conversations_bp.post('/<int:conversation_id>/messages')
@token_required
def send_rest_message(conversation_id):
    data = request.get_json(silent=True) or {}
    result = add_message(conversation_id, g.current_user.id, data.get('body'))
    if len(result) == 3:
        _, error, status = result
        return jsonify({'error': error}), status
    message, error = result
    if error:
        return jsonify({'error': error}), 400
    payload = message_dict(message)
    emit_to_conversation_members(conversation_id, 'new_message', payload)
    return jsonify({'message': payload}), 201


@conversations_bp.post('/<int:conversation_id>/read')
@token_required
def set_read_cursor(conversation_id):
    participant = mark_read(conversation_id, g.current_user.id)
    if not participant:
        return jsonify({'error': 'Conversation not found'}), 404
    return jsonify({'last_read_at': participant.last_read_at.isoformat()}), 200


@conversations_bp.post('/<int:conversation_id>/participants')
@token_required
def add_participants(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404
    actor = membership(conversation_id, g.current_user.id)
    if conversation.kind != 'group' or actor.role != 'admin':
        return jsonify({'error': 'Only group administrators can add members'}), 403
    error, status = add_group_members(conversation, (request.get_json(silent=True) or {}).get('member_ids'))
    if error:
        return jsonify({'error': error}), status
    conversation = db.session.get(Conversation, conversation_id)
    payload = conversation_dict(conversation, g.current_user.id)
    emit_to_conversation_members(conversation_id, 'conversation_updated', payload)
    return jsonify({'conversation': payload}), 200


@conversations_bp.delete('/<int:conversation_id>/participants/<int:user_id>')
@token_required
def remove_participant(conversation_id, user_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404
    actor = membership(conversation_id, g.current_user.id)
    if conversation.kind != 'group' or actor.role != 'admin':
        return jsonify({'error': 'Only group administrators can remove members'}), 403
    error, status = remove_group_member(conversation, user_id)
    if error:
        return jsonify({'error': error}), status
    emit_to_user(user_id, 'conversation_removed', {'conversation_id': conversation_id})
    emit_to_conversation_members(conversation_id, 'conversation_updated', conversation_dict(conversation, g.current_user.id))
    return jsonify({'message': 'Member removed'}), 200


@conversations_bp.post('/<int:conversation_id>/leave')
@token_required
def leave_conversation(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404
    error, status = leave_group(conversation, g.current_user.id)
    if error:
        return jsonify({'error': error}), status
    emit_to_user(g.current_user.id, 'conversation_removed', {'conversation_id': conversation_id})
    return jsonify({'message': 'You left the group'}), 200


@conversations_bp.put('/<int:conversation_id>/name')
@token_required
def rename_conversation(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404
    data = request.get_json(silent=True) or {}
    new_name = data.get('name')
    error, status = rename_group(conversation, g.current_user.id, new_name)
    if error:
        return jsonify({'error': error}), status
    conversation = db.session.get(Conversation, conversation_id)
    payload = conversation_dict(conversation, g.current_user.id)
    emit_to_conversation_members(conversation_id, 'conversation_updated', payload)
    return jsonify({'conversation': payload}), 200
