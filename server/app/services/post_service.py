from datetime import datetime, timezone
from sqlalchemy import case
from app import db
from app.models.post import Post
from app.models.follow import Follow


def create_post(author_id, title, content, status='draft', allow_media_only=False):
    """
    Create a new post authored by the given user.
    Status can be 'draft' or 'published'.
    """
    title = title.strip() if isinstance(title, str) else ''
    content = content.strip() if isinstance(content, str) else ''
    if not content and not allow_media_only:
        return None, 'Write some text or attach media to your post'

    status = status.lower() if status else 'draft'
    if status not in ('draft', 'published'):
        return None, "Status must be either 'draft' or 'published'"

    now = datetime.now(timezone.utc)
    published_at = now if status == 'published' else None

    post = Post(
        title=title,
        content=content,
        status=status,
        author_id=author_id,
        created_at=now,
        updated_at=now,
        published_at=published_at
    )

    db.session.add(post)
    db.session.commit()
    return post, None


def get_public_posts(page=1, per_page=10, viewer_id=None):
    """
    Retrieve published posts for the public feed, newest first.
    Includes pagination.
    """
    query = Post.query.filter_by(status='published')
    if viewer_id:
        followed_ids = db.session.query(Follow.followed_id).filter_by(follower_id=viewer_id)
        query = query.order_by(case((Post.author_id.in_(followed_ids), 0), else_=1))
    pagination = query \
        .order_by(Post.published_at.desc(), Post.created_at.desc()) \
        .paginate(page=page, per_page=per_page, error_out=False)

    return {
        # The feed is a reading surface: return the complete published writing.
        'posts': [p.to_dict(include_content=True, viewer_id=viewer_id) for p in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'per_page': pagination.per_page,
        'pages': pagination.pages,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
    }


def get_post_by_id(post_id, requesting_user_id=None):
    """
    Retrieve a post by its ID:
    - If published: anyone can view.
    - If draft: ONLY the author can view.
    Returns (post, error_message, http_status_code).
    """
    post = db.session.get(Post, post_id)
    if not post:
        return None, 'Post not found', 404

    # If post is a draft, verify author ownership
    if post.status == 'draft':
        if not requesting_user_id or post.author_id != requesting_user_id:
            # Conceal existence of draft from unauthorized users (standard 404)
            return None, 'Post not found', 404

    return post, None, 200


def update_post(post_id, user_id, title=None, content=None, status=None):
    """
    Update post fields. Enforces author ownership.
    Returns (post, error_message, http_status_code).
    """
    post = db.session.get(Post, post_id)
    if not post:
        return None, 'Post not found', 404

    if post.author_id != user_id:
        return None, 'You are not authorized to edit this post', 403

    if title is not None:
        if not isinstance(title, str):
            return None, 'Title must be text', 400
        post.title = title.strip()

    if content is not None:
        if not isinstance(content, str):
            return None, 'Content must be text', 400
        if not content.strip() and not post.media:
            return None, 'Content cannot be empty', 400
        post.content = content.strip()

    if status is not None:
        status = status.lower()
        if status not in ('draft', 'published'):
            return None, "Status must be either 'draft' or 'published'", 400
        # If transitioning from draft to published for the first time, record timestamp
        if status == 'published' and not post.published_at:
            post.published_at = datetime.now(timezone.utc)
        post.status = status

    post.updated_at = datetime.now(timezone.utc)
    db.session.commit()
    return post, None, 200


def delete_post(post_id, user_id):
    """
    Delete a post. Enforces author ownership.
    Returns (success_boolean, error_message, http_status_code).
    """
    post = db.session.get(Post, post_id)
    if not post:
        return False, 'Post not found', 404

    if post.author_id != user_id:
        return False, 'You are not authorized to delete this post', 403

    db.session.delete(post)
    db.session.commit()
    return True, None, 200


def get_user_posts(user_id, status_filter=None, page=1, per_page=15):
    """
    Retrieve posts authored by user_id.
    Can filter by status ('draft' or 'published') or return all.
    """
    query = Post.query.filter_by(author_id=user_id)
    if status_filter in ('draft', 'published'):
        query = query.filter_by(status=status_filter)

    query = query.order_by(Post.updated_at.desc(), Post.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return {
        'posts': [p.to_dict(include_content=False) for p in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'per_page': pagination.per_page,
        'pages': pagination.pages,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
    }

