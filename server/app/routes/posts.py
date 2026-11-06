import uuid
from io import BytesIO
from PIL import Image, UnidentifiedImageError
from flask import Blueprint, request, jsonify, g, current_app, send_file, Response, stream_with_context
from werkzeug.utils import secure_filename
from app.utils.auth_middleware import token_required
from app.utils.token_util import decode_jwt_token
from app import db
from app.models.post import Post
from app.models.post_engagement import PostLike, PostComment, PostMedia
from app.services.notification_service import create_notification
from app.storage.media_storage import LocalMediaStorage, get_media_storage
from app.services.post_service import (
    create_post,
    get_public_posts,
    get_post_by_id,
    update_post,
    delete_post,
    get_user_posts,
)

posts_bp = Blueprint('posts', __name__, url_prefix='/api/posts')

MEDIA_TYPES = {
    'jpg': ('image', 'image/jpeg', {'image/jpeg', 'image/pjpeg'}, 'JPEG'),
    'jpeg': ('image', 'image/jpeg', {'image/jpeg', 'image/pjpeg'}, 'JPEG'),
    'png': ('image', 'image/png', {'image/png'}, 'PNG'),
    'webp': ('image', 'image/webp', {'image/webp'}, 'WEBP'),
    'mp3': ('audio', 'audio/mpeg', {'audio/mpeg', 'audio/mp3', 'audio/mpg'}, None),
    'wav': ('audio', 'audio/wav', {'audio/wav', 'audio/x-wav', 'audio/wave'}, None),
    'ogg': ('audio', 'audio/ogg', {'audio/ogg', 'application/ogg', 'audio/vorbis'}, None),
    'm4a': ('audio', 'audio/mp4', {'audio/mp4', 'audio/x-m4a', 'audio/m4a'}, None),
    'mp4': ('video', 'video/mp4', {'video/mp4'}, None),
    'webm': ('video', 'video/webm', {'video/webm'}, None),
}

MEDIA_SIZE_CONFIG = {
    'image': 'POST_MEDIA_MAX_IMAGE_BYTES',
    'audio': 'POST_MEDIA_MAX_AUDIO_BYTES',
    'video': 'POST_MEDIA_MAX_VIDEO_BYTES',
}


def _validate_media_content(extension, content, expected_image_format=None):
    if not content:
        return False
    if expected_image_format:
        try:
            with Image.open(BytesIO(content)) as image:
                if image.format != expected_image_format:
                    return False
                image.verify()
            return True
        except (UnidentifiedImageError, OSError, ValueError):
            return False
    if extension == 'mp3':
        if content.startswith(b'ID3'):
            if len(content) < 10:
                return False
            tag_size = sum((content[offset] & 0x7f) << (7 * (3 - index)) for index, offset in enumerate(range(6, 10)))
            frame_offset = 10 + tag_size
            return tag_size <= len(content) - 10 and _is_mp3_frame(content[frame_offset:frame_offset + 4])
        return _is_mp3_frame(content[:4])
    if extension == 'wav':
        return (len(content) >= 44 and content[:4] == b'RIFF' and content[8:12] == b'WAVE'
                and int.from_bytes(content[4:8], 'little') <= len(content) - 8
                and b'fmt ' in content[12:40] and b'data' in content[36:])
    if extension == 'ogg':
        if len(content) < 28 or content[:4] != b'OggS' or content[4] != 0:
            return False
        segment_count = content[26]
        if segment_count == 0 or len(content) < 27 + segment_count:
            return False
        packet_size = sum(content[27:27 + segment_count])
        return packet_size > 0 and len(content) >= 27 + segment_count + packet_size
    if extension == 'm4a':
        return _valid_iso_bmff(content, {b'M4A ', b'M4B ', b'isom', b'mp42'})
    if extension == 'mp4':
        return _valid_iso_bmff(content, {b'isom', b'iso2', b'mp41', b'mp42', b'avc1', b'M4V '})
    if extension == 'webm':
        return len(content) >= 16 and content.startswith(b'\x1a\x45\xdf\xa3') and b'webm' in content[:256]
    return False


def _is_mp3_frame(header):
    if len(header) < 4:
        return False
    value = int.from_bytes(header, 'big')
    return (
        value >> 21 == 0x7ff
        and ((value >> 19) & 0b11) != 0b01
        and ((value >> 17) & 0b11) != 0
        and ((value >> 12) & 0b1111) not in (0, 15)
        and ((value >> 10) & 0b11) != 0b11
    )


def _valid_iso_bmff(content, allowed_brands):
    if len(content) < 16 or content[4:8] != b'ftyp':
        return False
    box_size = int.from_bytes(content[:4], 'big')
    if box_size < 16 or box_size > len(content):
        return False
    brands = {content[8:12]}
    brands.update(content[offset:offset + 4] for offset in range(16, min(box_size, len(content)), 4))
    if not brands & allowed_brands:
        return False
    found_movie_metadata = False
    found_media_data = False
    offset = box_size
    while offset + 8 <= len(content):
        child_size = int.from_bytes(content[offset:offset + 4], 'big')
        child_type = content[offset + 4:offset + 8]
        if child_size < 8 or offset + child_size > len(content):
            return False
        found_movie_metadata |= child_type == b'moov'
        found_media_data |= child_type in (b'mdat', b'moof')
        offset += child_size
    return found_movie_metadata and found_media_data


def _get_optional_user_id():
    """
    Extract user_id from Authorization header if present, without failing if missing.
    Used for endpoints accessible publicly but offering author privileges when logged in.
    """
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        return None
    parts = auth_header.split()
    if len(parts) == 2 and parts[0].lower() == 'bearer':
        user_id, _ = decode_jwt_token(parts[1])
        return user_id
    return None


@posts_bp.route('', methods=['POST'])
@token_required
def handle_create_post():
    """
    POST /api/posts: Create a draft or published post.
    Requires authentication.
    """
    data = request.get_json() or {}
    title = data.get('title')
    content = data.get('content')
    status = data.get('status', 'draft')
    allow_media_only = data.get('media_pending') is True

    post, error = create_post(
        author_id=g.current_user.id,
        title=title,
        content=content,
        status='draft' if allow_media_only else status,
        allow_media_only=allow_media_only,
    )
    if error:
        return jsonify({'error': error}), 400

    return jsonify({
        'message': f"Post {'published' if post.status == 'published' else 'saved as draft'} successfully",
        'post': post.to_dict(include_content=True)
    }), 201


@posts_bp.route('', methods=['GET'])
def handle_get_feed():
    """
    GET /api/posts: Retrieve public feed of published posts with pagination.
    """
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=10, type=int)

    # Sanitize limits
    page = max(1, page)
    per_page = max(1, min(50, per_page))

    feed_data = get_public_posts(page=page, per_page=per_page, viewer_id=_get_optional_user_id())
    return jsonify(feed_data), 200


@posts_bp.route('/mine', methods=['GET'])
@token_required
def handle_get_my_posts():
    """
    GET /api/posts/mine: Retrieve authenticated user's posts (drafts and published).
    Supports optional status query parameter: ?status=draft or ?status=published.
    """
    status_filter = request.args.get('status')
    page = request.args.get('page', default=1, type=int)
    per_page = request.args.get('per_page', default=15, type=int)

    page = max(1, page)
    per_page = max(1, min(50, per_page))

    user_posts = get_user_posts(
        user_id=g.current_user.id,
        status_filter=status_filter,
        page=page,
        per_page=per_page
    )
    return jsonify(user_posts), 200


@posts_bp.route('/<int:post_id>', methods=['GET'])
def handle_get_single_post(post_id):
    """
    GET /api/posts/<id>: Get an individual post.
    - If published: anyone can read.
    - If draft: only author can read.
    """
    requesting_user_id = _get_optional_user_id()
    post, error, status_code = get_post_by_id(post_id, requesting_user_id)
    if error:
        return jsonify({'error': error}), status_code

    return jsonify({
        'post': post.to_dict(include_content=True, viewer_id=requesting_user_id)
    }), 200


@posts_bp.route('/<int:post_id>', methods=['PUT'])
@token_required
def handle_update_post(post_id):
    """
    PUT /api/posts/<id>: Update title, content, or publication status.
    Author-only.
    """
    data = request.get_json() or {}
    title = data.get('title')
    content = data.get('content')
    status = data.get('status')

    post, error, status_code = update_post(
        post_id=post_id,
        user_id=g.current_user.id,
        title=title,
        content=content,
        status=status
    )
    if error:
        return jsonify({'error': error}), status_code

    return jsonify({
        'message': 'Post updated successfully',
        'post': post.to_dict(include_content=True)
    }), 200


@posts_bp.route('/<int:post_id>', methods=['DELETE'])
@token_required
def handle_delete_post(post_id):
    """
    DELETE /api/posts/<id>: Delete a post.
    Author-only.
    """
    post = db.session.get(Post, post_id)
    filenames = [item.filename for item in post.media] if post and post.author_id == g.current_user.id else []
    storage = get_media_storage()
    staged = []
    try:
        for filename in filenames:
            staged.append((filename, storage.stage_delete(filename)))
    except Exception:
        for filename, temporary in reversed(staged):
            try: storage.restore_delete(filename, temporary)
            except Exception: current_app.logger.exception('Could not restore staged media file')
        return jsonify({'error': 'Post media could not be removed; the post is unchanged'}), 500
    try:
        success, error, status_code = delete_post(post_id, g.current_user.id)
    except Exception:
        db.session.rollback()
        for filename, temporary in reversed(staged):
            try: storage.restore_delete(filename, temporary)
            except Exception: current_app.logger.exception('Could not restore media after post deletion failure')
        raise
    if error:
        for filename, temporary in reversed(staged):
            try: storage.restore_delete(filename, temporary)
            except Exception: current_app.logger.exception('Could not restore media after post deletion denial')
        return jsonify({'error': error}), status_code
    for _, temporary in staged:
        try: storage.finalize_delete(temporary)
        except Exception: current_app.logger.exception('Post deleted but staged media cleanup failed')

    return jsonify({'message': 'Post deleted successfully'}), 200


@posts_bp.post('/<int:post_id>/like')
@token_required
def like_post(post_id):
    post = db.session.get(Post, post_id)
    if not post or post.status != 'published':
        return jsonify({'error': 'Post not found'}), 404
    like = PostLike.query.filter_by(post_id=post_id, user_id=g.current_user.id).first()
    if like:
        db.session.delete(like)
        liked = False
    else:
        db.session.add(PostLike(post_id=post_id, user_id=g.current_user.id))
        liked = True
    db.session.commit()
    if liked:
        create_notification(post.author_id, g.current_user.id, 'like', post_id)
    return jsonify({'liked': liked, 'like_count': PostLike.query.filter_by(post_id=post_id).count()}), 200


@posts_bp.get('/<int:post_id>/comments')
def get_post_comments(post_id):
    post = db.session.get(Post, post_id)
    if not post or post.status != 'published':
        return jsonify({'error': 'Post not found'}), 404
    comments = PostComment.query.filter_by(post_id=post_id).order_by(PostComment.created_at.asc(), PostComment.id.asc()).all()
    return jsonify({'comments': [comment.to_dict() for comment in comments]}), 200


@posts_bp.post('/<int:post_id>/comments')
@token_required
def create_post_comment(post_id):
    post = db.session.get(Post, post_id)
    if not post or post.status != 'published':
        return jsonify({'error': 'Post not found'}), 404
    data = request.get_json() or {}
    body = data.get('body')
    if not isinstance(body, str) or not body.strip() or len(body.strip()) > 2000:
        return jsonify({'error': 'Comments must contain 1 to 2,000 characters'}), 400
    comment = PostComment(post_id=post_id, user_id=g.current_user.id, body=body.strip())
    db.session.add(comment)
    db.session.commit()
    create_notification(post.author_id, g.current_user.id, 'comment', post_id)
    return jsonify({'comment': comment.to_dict(), 'comment_count': PostComment.query.filter_by(post_id=post_id).count()}), 201


@posts_bp.post('/<int:post_id>/media')
@token_required
def add_post_media(post_id):
    post = db.session.get(Post, post_id)
    if not post or post.author_id != g.current_user.id:
        return jsonify({'error': 'Post not found'}), 404
    uploads = request.files.getlist('files')
    max_attachments = current_app.config['POST_MEDIA_MAX_ATTACHMENTS']
    if not uploads or len(uploads) > max_attachments or len(post.media) + len(uploads) > max_attachments:
        return jsonify({'error': f'Choose between 1 and {max_attachments} files; a post can have up to {max_attachments} attachments'}), 400
    storage = get_media_storage()

    current_max = db.session.query(db.func.max(PostMedia.display_order)).filter_by(post_id=post_id).scalar()
    next_order = 0 if current_max is None else current_max + 1

    saved = []
    try:
        for idx, upload in enumerate(uploads):
            clean_name = secure_filename(upload.filename or '')
            extension = clean_name.rsplit('.', 1)[-1].lower() if '.' in clean_name else ''
            type_info = MEDIA_TYPES.get(extension)
            if not clean_name or not type_info:
                raise ValueError('Supported formats: JPEG, PNG, WebP, MP3, WAV, OGG, M4A, MP4, and WebM')

            media_type, canonical_mime, accepted_mimes, image_format = type_info
            if upload.mimetype not in accepted_mimes:
                raise ValueError(f'The supplied MIME type does not match the selected {extension.upper()} format')

            limit_bytes = current_app.config[MEDIA_SIZE_CONFIG[media_type]]
            content = upload.read(limit_bytes + 1)
            file_size = len(content)
            if not content:
                raise ValueError(f'{clean_name} is empty')
            if file_size > limit_bytes:
                limit_mb = limit_bytes // (1024 * 1024)
                raise ValueError(f'{clean_name} exceeds the {limit_mb} MB limit for {media_type} files')

            if not _validate_media_content(extension, content, image_format):
                raise ValueError(f'{clean_name} is not a valid {extension.upper()} file')

            stored_extension = 'jpg' if extension == 'jpeg' else extension
            filename = f'{uuid.uuid4().hex}.{stored_extension}'
            storage.save(filename, content, canonical_mime)
            saved.append((filename, clean_name[:255], media_type, canonical_mime, file_size, next_order + idx))

        for filename, name, media_type, mime_type, file_size, display_order in saved:
            db.session.add(PostMedia(
                post_id=post_id,
                filename=filename,
                original_name=name,
                media_type=media_type,
                mime_type=mime_type,
                file_size=file_size,
                display_order=display_order,
            ))
        db.session.commit()
        db.session.refresh(post)
    except ValueError as error:
        db.session.rollback()
        for filename, *_ in saved:
            try: storage.delete(filename)
            except Exception: current_app.logger.exception('Could not clean up uploaded media after validation failure')
        return jsonify({'error': str(error)}), 400
    except Exception:
        db.session.rollback()
        for filename, *_ in saved:
            try: storage.delete(filename)
            except Exception: current_app.logger.exception('Could not clean up uploaded media after database failure')
        raise
    new_media = PostMedia.query.filter(PostMedia.filename.in_([item[0] for item in saved])).order_by(PostMedia.display_order.asc()).all()
    return jsonify({'media': [item.to_dict() for item in new_media]}), 201


@posts_bp.get('/<int:post_id>/media')
def get_post_media(post_id):
    post, error, status = get_post_by_id(post_id, _get_optional_user_id())
    if error:
        return jsonify({'error': error}), status
    media = PostMedia.query.filter_by(post_id=post.id).order_by(PostMedia.display_order.asc(), PostMedia.id.asc()).all()
    return jsonify({'media': [item.to_dict() for item in media]}), 200


@posts_bp.put('/<int:post_id>/media/reorder')
@token_required
def reorder_post_media(post_id):
    """
    PUT /api/posts/<post_id>/media/reorder
    Accepts: { "order": [media_id_1, media_id_2, ...] }
    Author-only. Reorders the display order of media attachments.
    """
    post = db.session.get(Post, post_id)
    if not post or post.author_id != g.current_user.id:
        return jsonify({'error': 'Post not found'}), 404

    data = request.get_json() or {}
    order_ids = data.get('order')
    if not isinstance(order_ids, list):
        return jsonify({'error': 'Expected "order" list of media IDs'}), 400

    existing_media = {m.id: m for m in post.media}
    if (any(isinstance(mid, bool) or not isinstance(mid, int) for mid in order_ids)
            or len(order_ids) != len(existing_media)
            or len(set(order_ids)) != len(order_ids)
            or set(order_ids) != set(existing_media)):
        return jsonify({'error': 'Order must contain each attachment ID exactly once'}), 400
    for idx, mid in enumerate(order_ids):
        existing_media[mid].display_order = idx

    db.session.commit()
    db.session.refresh(post)
    return jsonify({'media': [item.to_dict() for item in post.media]}), 200


@posts_bp.delete('/<int:post_id>/media/<int:media_id>')
@token_required
def delete_post_media(post_id, media_id):
    post = db.session.get(Post, post_id)
    if not post or post.author_id != g.current_user.id:
        return jsonify({'error': 'Post not found'}), 404
    media = PostMedia.query.filter_by(id=media_id, post_id=post_id).first()
    if not media:
        return jsonify({'message': 'Media already removed'}), 200
    storage = get_media_storage()
    try:
        staged = storage.stage_delete(media.filename)
    except Exception:
        current_app.logger.exception('Could not stage media deletion')
        return jsonify({'error': 'Media could not be removed; the attachment is unchanged'}), 500
    filename = media.filename
    try:
        db.session.delete(media)
        db.session.commit()
    except Exception:
        db.session.rollback()
        try: storage.restore_delete(filename, staged)
        except Exception: current_app.logger.exception('Could not restore media after database failure')
        raise
    try: storage.finalize_delete(staged)
    except Exception: current_app.logger.exception('Media row removed but staged file cleanup failed')
    return jsonify({'message': 'Media removed'}), 200


@posts_bp.get('/media/<string:filename>')
def serve_post_media(filename):
    media = PostMedia.query.filter_by(filename=filename).first_or_404()
    if media.post.status == 'draft':
        viewer_id = _get_optional_user_id()
        if viewer_id != media.post.author_id:
            return jsonify({'error': 'Media not found'}), 404
    storage = get_media_storage()
    try:
        if isinstance(storage, LocalMediaStorage):
            response = send_file(storage.resolve(media.filename), mimetype=media.mime_type, as_attachment=False, conditional=True)
        else:
            stored = storage.get_object(media.filename, request.headers.get('Range'))
            body = stored['Body']
            def stream_body():
                try:
                    yield from body.iter_chunks(chunk_size=64 * 1024)
                finally:
                    body.close()
            response = Response(stream_with_context(stream_body()),
                                status=206 if stored.get('ContentRange') else 200,
                                mimetype=media.mime_type, direct_passthrough=True)
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Content-Length'] = str(stored['ContentLength'])
            if stored.get('ContentRange'):
                response.headers['Content-Range'] = stored['ContentRange']
    except Exception as error:
        current_app.logger.warning('Media retrieval failed (%s)', type(error).__name__)
        return jsonify({'error': 'Media file is unavailable'}), 404
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if media.post.status == 'draft':
        response.headers['Cache-Control'] = 'private, no-store'
    return response

