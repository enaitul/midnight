from flask import Blueprint, jsonify, request
from app.services.community_service import search_users, search_writings
from app.utils.token_util import decode_jwt_token

search_bp = Blueprint('search', __name__, url_prefix='/api/search')


def _optional_user_id():
    header = request.headers.get('Authorization', '').split()
    if len(header) == 2 and header[0].lower() == 'bearer':
        user_id, error = decode_jwt_token(header[1])
        if not error:
            return user_id
    return None


@search_bp.get('')
def search():
    term = (request.args.get('q') or '').strip()
    category = request.args.get('type', 'writings')
    page = max(1, request.args.get('page', 1, type=int))
    per_page = min(50, max(1, request.args.get('per_page', 15, type=int)))

    if len(term) > 100:
        return jsonify({'error': 'Search terms must be 100 characters or fewer'}), 400
    if category not in ('writings', 'users'):
        return jsonify({'error': "type must be 'writings' or 'users'"}), 400
    if not term:
        return jsonify({
            'results': [],
            'total': 0,
            'page': page,
            'per_page': per_page,
            'pages': 0,
            'has_next': False,
            'has_prev': False,
        }), 200

    if category == 'writings':
        paginated_data = search_writings(term, page=page, per_page=per_page)
    else:
        viewer_id = _optional_user_id()
        paginated_data = search_users(term, viewer_id=viewer_id, page=page, per_page=per_page)

    return jsonify({
        'results': paginated_data['items'],
        'total': paginated_data['total'],
        'page': paginated_data['page'],
        'per_page': paginated_data['per_page'],
        'pages': paginated_data['pages'],
        'has_next': paginated_data['has_next'],
        'has_prev': paginated_data['has_prev'],
    }), 200
