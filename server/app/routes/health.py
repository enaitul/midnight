from flask import Blueprint, jsonify

# A Blueprint is a way to organize related routes into a group.
# This blueprint handles the /api/health endpoint.
health_bp = Blueprint('health', __name__)


@health_bp.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint.

    The frontend calls this to verify the backend is running.
    Returns a simple JSON response with status "ok".
    """
    return jsonify({
        'status': 'ok',
        'message': 'midnight. API is running'
    })

