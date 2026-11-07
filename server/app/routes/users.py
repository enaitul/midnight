import os
import uuid
from urllib.parse import urlparse
from flask import Blueprint, current_app, g, jsonify, request, send_from_directory, Response, stream_with_context
from PIL import Image, UnidentifiedImageError
from app import db
from app.models.post import Post
from app.models.saved_writing import SavedWriting
from app.models.user import User
from app.models.follow import Follow
from app.services.community_service import public_profile, save_writing, unsave_writing
from app.services.notification_service import create_notification
from app.utils.auth_middleware import token_required
from app.utils.token_util import decode_jwt_token
from app.storage.media_storage import LocalMediaStorage, get_media_storage

users_bp = Blueprint('users', __name__, url_prefix='/api/users')
ALLOWED_IMAGE_TYPES = {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp'}


def _optional_user_id():
    header = request.headers.get('Authorization', '').split()
    if len(header) == 2 and header[0].lower() == 'bearer':
        user_id, error = decode_jwt_token(header[1])
        if not error:
            return user_id
    return None


@users_bp.get('/avatars/<path:filename>')
def get_avatar(filename):
    storage = get_media_storage(category='avatars')
    try:
        if isinstance(storage, LocalMediaStorage):
            return send_from_directory(current_app.config['AVATAR_UPLOAD_FOLDER'], filename)
        stored = storage.get_object(filename, request.headers.get('Range'))
        body = stored['Body']
        def stream_body():
            try:
                yield from body.iter_chunks(chunk_size=64 * 1024)
            finally:
                body.close()
        response = Response(stream_with_context(stream_body()),
                            status=206 if stored.get('ContentRange') else 200,
                            mimetype=stored.get('ContentType', 'application/octet-stream'), direct_passthrough=True)
        response.headers['Content-Length'] = str(stored['ContentLength'])
        response.headers['Accept-Ranges'] = 'bytes'
        if stored.get('ContentRange'):
            response.headers['Content-Range'] = stored['ContentRange']
        return response
    except Exception as error:
        current_app.logger.warning('Avatar retrieval failed (%s)', type(error).__name__)
        return jsonify({'error': 'Avatar is unavailable'}), 404


@users_bp.get('/<string:username>')
def get_public_profile(username):
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': public_profile(user, _optional_user_id())}), 200


@users_bp.post('/<string:username>/follow')
@token_required
def follow_user(username):
    followed = User.query.filter_by(username=username).first()
    if not followed:
        return jsonify({'error': 'User not found'}), 404
    if followed.id == g.current_user.id:
        return jsonify({'error': 'You cannot follow your own account'}), 400
    edge = Follow.query.filter_by(follower_id=g.current_user.id, followed_id=followed.id).first()
    if not edge:
        db.session.add(Follow(follower_id=g.current_user.id, followed_id=followed.id))
        db.session.commit()
        create_notification(followed.id, g.current_user.id, 'follow')
    return jsonify({'is_following': True, 'follower_count': Follow.query.filter_by(followed_id=followed.id).count()}), 200


@users_bp.delete('/<string:username>/follow')
@token_required
def unfollow_user(username):
    followed = User.query.filter_by(username=username).first()
    if not followed:
        return jsonify({'error': 'User not found'}), 404
    edge = Follow.query.filter_by(follower_id=g.current_user.id, followed_id=followed.id).first()
    if edge:
        db.session.delete(edge)
        db.session.commit()
    return jsonify({'is_following': False, 'follower_count': Follow.query.filter_by(followed_id=followed.id).count()}), 200


@users_bp.get('/me')
@token_required
def get_my_profile():
    profile = g.current_user.to_dict()
    profile['contributions'] = len([post for post in g.current_user.posts if post.status == 'published'])
    return jsonify({'user': profile}), 200


@users_bp.put('/me')
@token_required
def update_my_profile():
    data = request.get_json(silent=True) or {}
    display_name = data.get('display_name')
    biography = data.get('biography')
    instagram_url = data.get('instagram_url')
    age = data.get('age')
    age_public = data.get('age_public')

    if display_name is not None:
        if not isinstance(display_name, str):
            return jsonify({'error': 'Display name must be text'}), 400
        display_name = display_name.strip()
        if not display_name or len(display_name) > 100:
            return jsonify({'error': 'Display name must be between 1 and 100 characters'}), 400
        g.current_user.display_name = display_name
    if biography is not None:
        if not isinstance(biography, str):
            return jsonify({'error': 'Biography must be text'}), 400
        biography = biography.strip()
        if len(biography) > 500:
            return jsonify({'error': 'Biography must be 500 characters or fewer'}), 400
        g.current_user.biography = biography or None
    if 'instagram_url' in data:
        if not isinstance(instagram_url, str):
            return jsonify({'error': 'Instagram link must be text'}), 400
        instagram_url = instagram_url.strip()
        if instagram_url:
            try:
                parsed_url = urlparse(instagram_url)
                valid_instagram_url = (
                    parsed_url.scheme == 'https'
                    and parsed_url.hostname in {'instagram.com', 'www.instagram.com'}
                    and bool(parsed_url.path.strip('/'))
                    and not parsed_url.username
                    and not parsed_url.password
                    and len(instagram_url) <= 2048
                )
            except ValueError:
                valid_instagram_url = False
            if not valid_instagram_url:
                return jsonify({'error': 'Enter a full Instagram profile link, such as https://www.instagram.com/username/'}), 400
        g.current_user.instagram_url = instagram_url or None
    if 'age' in data:
        if age in ('', None):
            g.current_user.age = None
        elif isinstance(age, bool) or not isinstance(age, int) or age < 0 or age > 130:
            return jsonify({'error': 'Age must be a whole number from 0 to 130, or left blank'}), 400
        else:
            g.current_user.age = age
    if age_public is not None:
        if not isinstance(age_public, bool):
            return jsonify({'error': 'age_public must be true or false'}), 400
        g.current_user.age_public = age_public

    db.session.commit()
    profile = g.current_user.to_dict()
    profile['contributions'] = sum(post.status == 'published' for post in g.current_user.posts)
    return jsonify({'message': 'Profile updated', 'user': profile}), 200


@users_bp.post('/me/avatar')
@token_required
def upload_avatar():
    image = request.files.get('avatar')
    if not image or not image.filename:
        return jsonify({'error': 'Choose an image to upload'}), 400
    extension = ALLOWED_IMAGE_TYPES.get(image.mimetype)
    if not extension:
        return jsonify({'error': 'Use a PNG, JPEG, or WebP image'}), 400
    image.stream.seek(0, os.SEEK_END)
    size = image.stream.tell()
    image.stream.seek(0)
    if size > 3 * 1024 * 1024:
        return jsonify({'error': 'Profile images must be 3 MB or smaller'}), 413

    expected_format = {'.png': 'PNG', '.jpg': 'JPEG', '.webp': 'WEBP'}[extension]
    try:
        with Image.open(image.stream) as decoded:
            if decoded.format != expected_format or decoded.width * decoded.height > 16_000_000:
                return jsonify({'error': 'The file contents do not match a supported profile image'}), 400
            decoded.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return jsonify({'error': 'The file contents do not match a PNG, JPEG, or WebP image'}), 400
    image.stream.seek(0)

    filename = f'{uuid.uuid4().hex}{extension}'
    storage = get_media_storage(category='avatars')
    try:
        storage.save(filename, image.stream.read(), image.mimetype)
    except Exception:
        current_app.logger.exception('Could not store profile image')
        return jsonify({'error': 'Profile picture could not be stored'}), 500
    old_avatar = g.current_user.avatar_url
    g.current_user.avatar_url = f"/api/users/avatars/{filename}"
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        try: storage.delete(filename)
        except Exception: current_app.logger.exception('Could not remove profile image after database failure')
        current_app.logger.exception('Could not update profile image metadata')
        return jsonify({'error': 'Profile picture could not be updated'}), 500
    if old_avatar and old_avatar.startswith('/api/users/avatars/'):
        old_filename = old_avatar.rsplit('/', 1)[-1]
        try: storage.delete(old_filename)
        except Exception: current_app.logger.exception('Updated profile image but could not remove the old file')
    return jsonify({'message': 'Profile picture updated', 'avatar_url': g.current_user.avatar_url}), 200


@users_bp.get('/me/saved')
@token_required
def get_saved_writings():
    rows = SavedWriting.query.filter_by(user_id=g.current_user.id).join(Post).filter(Post.status == 'published').order_by(SavedWriting.created_at.desc()).all()
    return jsonify({'posts': [row.post.to_dict(include_content=False) for row in rows]}), 200


@users_bp.get('/me/saved/ids')
@token_required
def get_saved_writing_ids():
    rows = SavedWriting.query.join(Post).filter(SavedWriting.user_id == g.current_user.id, Post.status == 'published').all()
    return jsonify({'ids': [row.post_id for row in rows]}), 200


@users_bp.post('/me/saved/<int:post_id>')
@token_required
def add_saved_writing(post_id):
    saved, error, status = save_writing(g.current_user.id, post_id)
    if error:
        return jsonify({'error': error}), status
    return jsonify({'message': 'Writing saved', 'post_id': saved.post_id}), 201


@users_bp.delete('/me/saved/<int:post_id>')
@token_required
def remove_saved_writing(post_id):
    unsave_writing(g.current_user.id, post_id)
    return jsonify({'message': 'Writing removed from saved'}), 200
