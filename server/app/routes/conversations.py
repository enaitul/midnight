import uuid
from io import BytesIO
from flask import Blueprint, current_app, g, jsonify, request, send_file, Response, stream_with_context
from werkzeug.utils import secure_filename
from PIL import Image, UnidentifiedImageError
from app import db
from app.models.conversation import Conversation, ConversationParticipant, Message, MessageMedia
from app.services.conversation_service import (
    add_group_members, add_message, conversation_dict, leave_group, mark_read,
    group_message_receipts, membership, message_dict, remove_group_member, rename_group, create_direct, create_group,
    emit_to_conversation_members, emit_to_user, update_group_details, update_group_member_role,
)
from app.utils.auth_middleware import token_required
from app.storage.media_storage import LocalMediaStorage, get_media_storage
from app.utils.media_validation import MEDIA_TYPES, MEDIA_SIZE_CONFIG, validate_media_content

conversations_bp = Blueprint('conversations', __name__, url_prefix='/api/conversations')
GROUP_AVATAR_TYPES = {'image/jpeg': ('.jpg', 'JPEG'), 'image/png': ('.png', 'PNG'), 'image/webp': ('.webp', 'WEBP')}


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
    conversation, error, status = create_group(
        g.current_user.id, data.get('name'), data.get('member_ids'), data.get('description', ''),
    )
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


@conversations_bp.get('/<int:conversation_id>/messages/<int:message_id>/receipts')
@token_required
def get_group_message_receipts(conversation_id, message_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation or conversation.kind != 'group':
        return jsonify({'error': 'Message not found'}), 404
    message = db.session.get(Message, message_id)
    if not message or message.conversation_id != conversation_id or message.sender_id != g.current_user.id:
        return jsonify({'error': 'Message not found'}), 404
    return jsonify({'receipts': group_message_receipts(message, g.current_user.id)}), 200


@conversations_bp.post('/<int:conversation_id>/messages')
@token_required
def send_rest_message(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Conversation not found'}), 404
    has_files = request.mimetype == 'multipart/form-data'
    data = request.form if has_files else (request.get_json(silent=True) or {})
    body = data.get('body', '')
    reply_to_id = data.get('reply_to_id') or None
    if reply_to_id is not None:
        try: reply_to_id = int(reply_to_id)
        except (TypeError, ValueError): return jsonify({'error': 'Invalid reply target'}), 400
    uploads = request.files.getlist('files') if has_files else []
    if not isinstance(body, str) or len(body.strip()) > 5000 or (not body.strip() and not uploads and reply_to_id is None):
        return jsonify({'error': 'Messages must contain text or an attachment, with up to 5,000 characters'}), 400
    message = None
    saved = []
    if uploads:
        if len(uploads) > current_app.config['CONVERSATION_MEDIA_MAX_FILES']:
            return jsonify({'error': f"A message can contain up to {current_app.config['CONVERSATION_MEDIA_MAX_FILES']} attachments"}), 400
        storage = get_media_storage(category='conversations')
        total_bytes = 0
        try:
            media_rows = []
            for upload in uploads:
                clean_name = secure_filename(upload.filename or '')
                extension = clean_name.rsplit('.', 1)[-1].lower() if '.' in clean_name else ''
                type_info = MEDIA_TYPES.get(extension)
                if extension == 'webm' and upload.mimetype == 'audio/webm':
                    type_info = ('audio', 'audio/webm', {'audio/webm'}, None)
                if not clean_name or not type_info:
                    raise ValueError('Supported formats: JPEG, PNG, WebP, MP3, WAV, OGG, M4A, MP4, and WebM')
                media_type, canonical_mime, accepted_mimes, image_format = type_info
                if upload.mimetype not in accepted_mimes:
                    raise ValueError(f'The supplied MIME type does not match the selected {extension.upper()} format')
                limit = current_app.config[MEDIA_SIZE_CONFIG[media_type]]
                content = upload.read(limit + 1)
                total_bytes += len(content)
                if not content:
                    raise ValueError(f'{clean_name} is empty')
                if len(content) > limit:
                    raise ValueError(f'{clean_name} exceeds its {limit // (1024 * 1024)} MB {media_type} file limit')
                if total_bytes > current_app.config['CONVERSATION_MEDIA_MAX_TOTAL_BYTES']:
                    raise ValueError('Attachments in one message must total 100 MB or less')
                if not validate_media_content(extension, content, image_format):
                    raise ValueError(f'{clean_name} is not a valid {extension.upper()} file')
                stored_extension = 'jpg' if extension == 'jpeg' else extension
                filename = f'{uuid.uuid4().hex}.{stored_extension}'
                storage.save(filename, content, canonical_mime)
                saved.append(filename)
                media_rows.append((filename, clean_name[:255], media_type, canonical_mime, len(content)))
            reply = db.session.get(Message, reply_to_id) if reply_to_id is not None else None
            if reply_to_id is not None and (not reply or reply.conversation_id != conversation_id):
                raise ValueError('Reply target was not found in this conversation')
            message = Message(conversation_id=conversation_id, sender_id=g.current_user.id, body=body.strip(), reply_to=reply)
            db.session.add(message)
            db.session.flush()
            db.session.add_all(MessageMedia(message_id=message.id, filename=filename, original_name=name,
                                            media_type=kind, mime_type=mime, file_size=size)
                               for filename, name, kind, mime, size in media_rows)
            db.session.commit()
        except ValueError as error:
            db.session.rollback()
            for filename in saved:
                try: storage.delete(filename)
                except Exception: current_app.logger.exception('Could not clean up rejected conversation media')
            return jsonify({'error': str(error)}), 400
        except Exception:
            db.session.rollback()
            for filename in saved:
                try: storage.delete(filename)
                except Exception: current_app.logger.exception('Could not clean up conversation media after database failure')
            raise
    else:
        result = add_message(conversation_id, g.current_user.id, body, reply_to_id)
        if len(result) == 3:
            _, error, status = result
            return jsonify({'error': error}), status
        message, error = result
        if error:
            return jsonify({'error': error}), 400
    payload = message_dict(message)
    emit_to_conversation_members(conversation_id, 'new_message', payload)
    return jsonify({'message': payload}), 201


@conversations_bp.get('/media/<string:filename>')
@token_required
def serve_conversation_media(filename):
    media = MessageMedia.query.filter_by(filename=filename).first()
    if not media or not membership(media.message.conversation_id, g.current_user.id):
        return jsonify({'error': 'Media not found'}), 404
    storage = get_media_storage(category='conversations')
    try:
        if isinstance(storage, LocalMediaStorage):
            response = send_file(storage.resolve(filename), mimetype=media.mime_type,
                                 as_attachment=False, conditional=True, download_name=media.original_name)
        else:
            stored = storage.get_object(filename, request.headers.get('Range'))
            status_code = 206 if stored.get('ContentRange') else 200
            response = Response(stream_with_context(stored['Body'].iter_chunks()), status=status_code,
                                mimetype=media.mime_type, direct_passthrough=True)
            response.content_length = stored.get('ContentLength')
            if stored.get('ContentRange'):
                response.headers['Content-Range'] = stored['ContentRange']
            response.headers['Accept-Ranges'] = 'bytes'
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response
    except FileNotFoundError:
        return jsonify({'error': 'Media not found'}), 404


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


@conversations_bp.put('/<int:conversation_id>/details')
@token_required
def update_conversation_details(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Group not found'}), 404
    data = request.get_json(silent=True) or {}
    error, status = update_group_details(
        conversation, g.current_user.id, data.get('name'), data.get('description', ''),
    )
    if error:
        return jsonify({'error': error}), status
    payload = conversation_dict(db.session.get(Conversation, conversation_id), g.current_user.id)
    emit_to_conversation_members(conversation_id, 'conversation_updated', payload)
    return jsonify({'conversation': payload}), 200


@conversations_bp.put('/<int:conversation_id>/participants/<int:user_id>/role')
@token_required
def update_participant_role(conversation_id, user_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Group not found'}), 404
    actor = membership(conversation_id, g.current_user.id)
    if conversation.kind != 'group' or actor.role != 'admin':
        return jsonify({'error': 'Only group administrators can change member roles'}), 403
    data = request.get_json(silent=True) or {}
    error, status = update_group_member_role(conversation, user_id, data.get('role'))
    if error:
        return jsonify({'error': error}), status
    payload = conversation_dict(db.session.get(Conversation, conversation_id), g.current_user.id)
    emit_to_conversation_members(conversation_id, 'conversation_updated', payload)
    return jsonify({'conversation': payload}), 200


@conversations_bp.post('/<int:conversation_id>/group-avatar')
@token_required
def upload_group_avatar(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Group not found'}), 404
    actor = membership(conversation_id, g.current_user.id)
    if conversation.kind != 'group' or actor.role != 'admin':
        return jsonify({'error': 'Only group administrators can change the group picture'}), 403
    image = request.files.get('avatar')
    if not image or not image.filename:
        return jsonify({'error': 'Choose a group picture first'}), 400
    image_type = GROUP_AVATAR_TYPES.get(image.mimetype)
    extension = secure_filename(image.filename).rsplit('.', 1)[-1].lower() if '.' in image.filename else ''
    if not image_type or extension not in {'jpg', 'jpeg', 'png', 'webp'}:
        return jsonify({'error': 'Use a JPEG, PNG, or WebP image'}), 400
    expected_extension, expected_format = image_type
    if (expected_extension == '.jpg' and extension not in {'jpg', 'jpeg'}) or extension != expected_extension.lstrip('.') and expected_extension != '.jpg':
        return jsonify({'error': 'The file extension and image type must match'}), 400
    content = image.stream.read(3 * 1024 * 1024 + 1)
    if len(content) > 3 * 1024 * 1024:
        return jsonify({'error': 'Group pictures must be 3 MB or smaller'}), 413
    try:
        with Image.open(BytesIO(content)) as decoded:
            if decoded.format != expected_format or decoded.width * decoded.height > 16_000_000:
                return jsonify({'error': 'The image must be a supported picture under 16 megapixels'}), 400
            decoded.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return jsonify({'error': 'The file contents do not match a supported image'}), 400

    filename = f'{uuid.uuid4().hex}{expected_extension}'
    storage = get_media_storage(category='conversations')
    try:
        storage.save(filename, content, image_type and image.mimetype)
    except Exception:
        current_app.logger.exception('Could not store group picture')
        return jsonify({'error': 'Group picture could not be stored'}), 500
    previous_filename = conversation.avatar_filename
    conversation.avatar_filename = filename
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        try: storage.delete(filename)
        except Exception: current_app.logger.exception('Could not clean up a rejected group picture')
        current_app.logger.exception('Could not update group picture metadata')
        return jsonify({'error': 'Group picture could not be updated'}), 500
    if previous_filename:
        try: storage.delete(previous_filename)
        except Exception: current_app.logger.exception('Updated group picture but could not remove the previous file')
    payload = conversation_dict(conversation, g.current_user.id)
    emit_to_conversation_members(conversation_id, 'conversation_updated', payload)
    return jsonify({'conversation': payload}), 200


@conversations_bp.delete('/<int:conversation_id>/group-avatar')
@token_required
def remove_group_avatar(conversation_id):
    conversation = _authorized_conversation(conversation_id)
    if not conversation:
        return jsonify({'error': 'Group not found'}), 404
    actor = membership(conversation_id, g.current_user.id)
    if conversation.kind != 'group' or actor.role != 'admin':
        return jsonify({'error': 'Only group administrators can change the group picture'}), 403
    previous_filename = conversation.avatar_filename
    conversation.avatar_filename = None
    db.session.commit()
    if previous_filename:
        try: get_media_storage(category='conversations').delete(previous_filename)
        except Exception: current_app.logger.exception('Removed group picture metadata but could not remove its file')
    payload = conversation_dict(conversation, g.current_user.id)
    emit_to_conversation_members(conversation_id, 'conversation_updated', payload)
    return jsonify({'conversation': payload}), 200


@conversations_bp.get('/<int:conversation_id>/group-avatar/<string:filename>')
@token_required
def serve_group_avatar(conversation_id, filename):
    conversation = db.session.get(Conversation, conversation_id)
    if (not conversation or conversation.kind != 'group'
            or not membership(conversation_id, g.current_user.id)
            or conversation.avatar_filename != filename):
        return jsonify({'error': 'Group picture not found'}), 404
    mime_type = {'.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}.get(
        '.' + filename.rsplit('.', 1)[-1].lower(), 'application/octet-stream',
    )
    storage = get_media_storage(category='conversations')
    try:
        if isinstance(storage, LocalMediaStorage):
            response = send_file(storage.resolve(filename), mimetype=mime_type, as_attachment=False,
                                 conditional=True, max_age=0)
        else:
            stored = storage.get_object(filename)
            body = stored['Body']
            def stream_body():
                try: yield from body.iter_chunks(chunk_size=64 * 1024)
                finally: body.close()
            response = Response(stream_with_context(stream_body()), mimetype=mime_type,
                                content_length=stored['ContentLength'], direct_passthrough=True)
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response
    except Exception as error:
        current_app.logger.warning('Group picture retrieval failed (%s)', type(error).__name__)
        return jsonify({'error': 'Group picture is unavailable'}), 404
