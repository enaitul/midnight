from datetime import datetime, timezone
from flask import current_app

from app import db, socketio
from app.models.notification import Notification


def create_notification(recipient_id, actor_id, kind, post_id=None):
    if not recipient_id or recipient_id == actor_id:
        return None
    notification = Notification(recipient_id=recipient_id, actor_id=actor_id, kind=kind, post_id=post_id)
    try:
        db.session.add(notification)
        db.session.commit()
    except Exception:
        db.session.rollback()
        current_app.logger.exception('Could not persist an activity notification')
        return None
    try:
        socketio.emit('new_notification', notification.to_dict(), to=f'user:{recipient_id}')
    except Exception:
        current_app.logger.exception('Could not send an activity notification over Socket.IO')
    return notification


def notification_summary(user_id, limit=50):
    rows = Notification.query.filter_by(recipient_id=user_id).order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    unread = Notification.query.filter_by(recipient_id=user_id, read_at=None).count()
    return {'notifications': [item.to_dict() for item in rows], 'unread_count': unread}


def mark_notification_read(notification, user_id):
    if notification.recipient_id != user_id:
        return False
    if not notification.read_at:
        notification.read_at = datetime.now(timezone.utc)
        db.session.commit()
    return True


def mark_all_notifications_read(user_id):
    Notification.query.filter_by(recipient_id=user_id, read_at=None).update(
        {'read_at': datetime.now(timezone.utc)}, synchronize_session=False,
    )
    db.session.commit()
