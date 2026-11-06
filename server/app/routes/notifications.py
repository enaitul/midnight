from flask import Blueprint, g, jsonify

from app.models.notification import Notification
from app.services.notification_service import (
    mark_all_notifications_read,
    mark_notification_read,
    notification_summary,
)
from app.utils.auth_middleware import token_required

notifications_bp = Blueprint('notifications', __name__, url_prefix='/api/notifications')


@notifications_bp.get('/unread-count')
@token_required
def unread_count():
    count = Notification.query.filter_by(recipient_id=g.current_user.id, read_at=None).count()
    return jsonify({'unread_count': count}), 200


@notifications_bp.get('')
@token_required
def list_notifications():
    return jsonify(notification_summary(g.current_user.id)), 200


@notifications_bp.post('/read-all')
@token_required
def read_all_notifications():
    mark_all_notifications_read(g.current_user.id)
    return jsonify({'unread_count': 0}), 200


@notifications_bp.post('/<int:notification_id>/read')
@token_required
def read_notification(notification_id):
    notification = Notification.query.filter_by(id=notification_id, recipient_id=g.current_user.id).first()
    if not notification or not mark_notification_read(notification, g.current_user.id):
        return jsonify({'error': 'Notification not found'}), 404
    return jsonify({'id': notification.id, 'read_at': notification.read_at.isoformat()}), 200
