from sqlalchemy import func, or_
from app import db
from app.models.post import Post
from app.models.saved_writing import SavedWriting
from app.models.user import User
from app.models.follow import Follow


def public_profile(user, viewer_id=None):
    contributions = db.session.query(func.count(Post.id)).filter_by(author_id=user.id, status='published').scalar() or 0
    data = user.to_public_dict(contributions)
    data['follower_count'] = Follow.query.filter_by(followed_id=user.id).count()
    data['following_count'] = Follow.query.filter_by(follower_id=user.id).count()
    data['is_following'] = bool(viewer_id and Follow.query.filter_by(follower_id=viewer_id, followed_id=user.id).first())
    # Include the user's published writings
    published_posts = Post.query.filter_by(author_id=user.id, status='published')\
        .order_by(Post.published_at.desc(), Post.created_at.desc()).all()
    data['posts'] = [p.to_dict(include_content=False) for p in published_posts]
    return data


def search_writings(term, page=1, per_page=15):
    escaped = term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    pattern = f'%{escaped}%'
    pagination = Post.query.filter(
        Post.status == 'published',
        or_(Post.title.ilike(pattern, escape='\\'), Post.content.ilike(pattern, escape='\\')),
    ).order_by(Post.published_at.desc(), Post.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return {
        'items': [post.to_dict(include_content=False) for post in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'per_page': pagination.per_page,
        'pages': pagination.pages,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
    }


def search_users(term, viewer_id=None, page=1, per_page=15):
    escaped = term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    pattern = f'%{escaped}%'
    pagination = User.query.filter(
        or_(User.username.ilike(pattern, escape='\\'), User.display_name.ilike(pattern, escape='\\')),
    ).order_by(User.username.asc()).paginate(page=page, per_page=per_page, error_out=False)

    return {
        'items': [public_profile(user, viewer_id=viewer_id) for user in pagination.items],
        'total': pagination.total,
        'page': pagination.page,
        'per_page': pagination.per_page,
        'pages': pagination.pages,
        'has_next': pagination.has_next,
        'has_prev': pagination.has_prev,
    }


def save_writing(user_id, post_id):
    post = Post.query.filter_by(id=post_id, status='published').first()
    if not post:
        return None, 'Published writing not found', 404
    saved = SavedWriting.query.filter_by(user_id=user_id, post_id=post_id).first()
    if not saved:
        saved = SavedWriting(user_id=user_id, post_id=post_id)
        db.session.add(saved)
        db.session.commit()
    return saved, None, 200


def unsave_writing(user_id, post_id):
    saved = SavedWriting.query.filter_by(user_id=user_id, post_id=post_id).first()
    if saved:
        db.session.delete(saved)
        db.session.commit()
    return True
