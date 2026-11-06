from flask import request, session
from flask_socketio import join_room
from app import db, socketio
from app.models.user import User
from app.services.conversation_service import add_message, emit_to_conversation_members, membership, message_dict
from app.utils.token_util import decode_jwt_token


@socketio.on('connect')
def authenticate_socket(auth):
    token = auth.get('token') if isinstance(auth, dict) else None
    if not token:
        return False
    user_id, error = decode_jwt_token(token)
    if error or not db.session.get(User, user_id):
        return False
    session['midnight_user_id'] = user_id
    join_room(f'user:{user_id}')


@socketio.on('join_conversation')
def join_conversation(data):
    user_id = session.get('midnight_user_id')
    conversation_id = data.get('conversation_id') if isinstance(data, dict) else None
    if not user_id or isinstance(conversation_id, bool) or not isinstance(conversation_id, int):
        return {'ok': False, 'error': 'Invalid conversation'}
    if not membership(conversation_id, user_id):
        return {'ok': False, 'error': 'Conversation not found'}
    join_room(f'conversation:{conversation_id}')
    return {'ok': True}


@socketio.on('send_message')
def send_socket_message(data):
    user_id = session.get('midnight_user_id')
    if not user_id or not isinstance(data, dict):
        return {'ok': False, 'error': 'Authentication required'}
    conversation_id = data.get('conversation_id')
    if isinstance(conversation_id, bool) or not isinstance(conversation_id, int):
        return {'ok': False, 'error': 'Invalid conversation'}
    result = add_message(conversation_id, user_id, data.get('body'))
    if len(result) == 3:
        return {'ok': False, 'error': result[1]}
    message, error = result
    if error:
        return {'ok': False, 'error': error}
    payload = message_dict(message)
    emit_to_conversation_members(conversation_id, 'new_message', payload)
    return {'ok': True, 'message': payload}


@socketio.on('disconnect')
def disconnect_socket(reason=None):
    db.session.remove()
