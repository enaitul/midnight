import pytest
import jwt
from io import BytesIO
from datetime import datetime, timedelta, timezone
from app import create_app, db, socketio
from app.models.user import User
from app.models.post import Post
from app.utils.token_util import generate_jwt_token


@pytest.fixture(scope='module')
def app(tmp_path_factory):
    upload_folder = tmp_path_factory.mktemp('community-uploads')
    application = create_app({
        'TESTING': True,
        'MEDIA_STORAGE_BACKEND': 'local',
        'SECRET_KEY': 'community-test-secret',
        'SQLALCHEMY_DATABASE_URI': 'sqlite://',
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'AVATAR_UPLOAD_FOLDER': str(upload_folder),
        'POST_MEDIA_FOLDER': str(upload_folder / 'post-media'),
        'GOOGLE_CLIENT_ID': 'test-google-client-id',
    })
    yield application
    with application.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture(autouse=True)
def clean_database(app):
    with app.app_context():
        db.drop_all()
        db.create_all()
    yield


@pytest.fixture()
def users(app):
    with app.app_context():
        rows = [User(username=name, email=f'{name}@example.test', display_name=name.title(),
                     password_hash='hashed', age=28, age_public=False) for name in ('alice', 'bob', 'cara')]
        db.session.add_all(rows)
        db.session.commit()
        return {row.username: {'id': row.id, 'token': generate_jwt_token(row.id)} for row in rows}


def auth(token):
    return {'Authorization': f'Bearer {token}'}


def test_profile_privacy_and_contribution_count(app, users):
    with app.app_context():
        author = User.query.filter_by(username='alice').one()
        db.session.add_all([
            Post(title='Published', content='hello', status='published', author_id=author.id),
            Post(title='Private draft', content='draft secret', status='draft', author_id=author.id),
        ])
        db.session.commit()
    client = app.test_client()
    public = client.get('/api/users/alice').get_json()['user']
    assert public['contributions'] == 1
    assert 'email' not in public and 'age' not in public and 'password_hash' not in public
    updated = client.put('/api/users/me', headers=auth(users['alice']['token']), json={
        'display_name': 'Alice Writer', 'biography': 'Quiet words.', 'age': 31, 'age_public': True,
    })
    assert updated.status_code == 200
    public = client.get('/api/users/alice').get_json()['user']
    assert public['age'] == 31
    assert 'email' not in public


def test_comment_likes_require_auth_and_toggle_once_per_user(app, users):
    client = app.test_client()
    with app.app_context():
        post = Post(title='A quiet post', content='Words', status='published', author_id=users['alice']['id'])
        db.session.add(post)
        db.session.commit()
        post_id = post.id
    created = client.post(f'/api/posts/{post_id}/comments', headers=auth(users['bob']['token']), json={'body': 'A kind note'})
    assert created.status_code == 201
    comment = created.get_json()['comment']
    assert comment['like_count'] == 0 and comment['liked_by_me'] is False
    comment_id = comment['id']
    assert client.post(f'/api/posts/comments/{comment_id}/like').status_code == 401
    liked = client.post(f'/api/posts/comments/{comment_id}/like', headers=auth(users['cara']['token']))
    assert liked.status_code == 200 and liked.get_json() == {'liked': True, 'like_count': 1}
    rows = client.get(f'/api/posts/{post_id}/comments', headers=auth(users['cara']['token'])).get_json()['comments']
    assert rows[0]['liked_by_me'] is True and rows[0]['like_count'] == 1
    unliked = client.post(f'/api/posts/comments/{comment_id}/like', headers=auth(users['cara']['token']))
    assert unliked.get_json() == {'liked': False, 'like_count': 0}


def test_avatar_upload_and_profile_validation(app, users):
    client = app.test_client()
    image = BytesIO()
    from PIL import Image
    Image.new('RGB', (4, 4), 'white').save(image, format='PNG')
    image.seek(0)
    upload = client.post('/api/users/me/avatar', headers=auth(users['alice']['token']), data={
        'avatar': (image, 'portrait.png', 'image/png'),
    }, content_type='multipart/form-data')
    assert upload.status_code == 200
    assert upload.get_json()['avatar_url'].startswith('/api/users/avatars/')
    assert client.put('/api/users/me', headers=auth(users['alice']['token']), json={'age': -1}).status_code == 400
    assert client.get(upload.get_json()['avatar_url']).status_code == 200
    corrupt = client.post('/api/users/me/avatar', headers=auth(users['alice']['token']), data={
        'avatar': (BytesIO(b'\x89PNG\r\n\x1a\nnot an image'), 'broken.png', 'image/png'),
    }, content_type='multipart/form-data')
    assert corrupt.status_code == 400


def test_search_excludes_drafts_and_private_account_data(app, users):
    with app.app_context():
        alice = User.query.filter_by(username='alice').one()
        db.session.add_all([
            Post(title='Moon journal', content='silver moonlight', status='published', author_id=alice.id),
            Post(title='Moon draft', content='hidden moonlight', status='draft', author_id=alice.id),
        ])
        db.session.commit()
    client = app.test_client()
    writings = client.get('/api/search?q=moon&type=writings').get_json()['results']
    people = client.get('/api/search?q=alice&type=users').get_json()['results']
    assert [row['title'] for row in writings] == ['Moon journal']
    assert len(people) == 1 and 'email' not in people[0]


def test_registration_draft_edit_publish_and_complete_feed(app):
    client = app.test_client()
    registered = client.post('/api/auth/register', json={
        'username': 'newwriter', 'email': 'newwriter@example.test', 'password': 'secret123',
    })
    assert registered.status_code == 201
    headers = auth(registered.get_json()['token'])
    created = client.post('/api/posts', headers=headers, json={
        'title': 'A first page', 'content': 'First paragraph.\n\nSecond paragraph.', 'status': 'draft',
    })
    assert created.status_code == 201
    post_id = created.get_json()['post']['id']
    assert client.get('/api/posts').get_json()['total'] == 0
    edited = client.put(f'/api/posts/{post_id}', headers=headers, json={
        'title': 'An edited page', 'content': 'One.\n\nTwo.\n\nThree.', 'status': 'published',
    })
    assert edited.status_code == 200
    feed = client.get('/api/posts').get_json()['posts']
    assert feed[0]['title'] == 'An edited page'
    assert feed[0]['content'] == 'One.\n\nTwo.\n\nThree.'
    assert client.post('/api/auth/login', json={'username': 'newwriter', 'password': 'secret123'}).status_code == 200


def test_expired_and_invalid_jwt_tokens_are_rejected(app, users):
    client = app.test_client()
    assert client.get('/api/auth/me').status_code == 401
    invalid = client.get('/api/auth/me', headers={'Authorization': 'Bearer not-a-jwt'})
    assert invalid.status_code == 401
    assert 'not-a-jwt' not in invalid.get_json()['error']
    with app.app_context():
        expired = jwt.encode({
            'sub': str(users['alice']['id']),
            'iat': datetime.now(timezone.utc) - timedelta(days=8),
            'exp': datetime.now(timezone.utc) - timedelta(days=1),
        }, app.config['SECRET_KEY'], algorithm='HS256')
    assert client.get('/api/auth/me', headers=auth(expired)).status_code == 401


def test_google_login_uses_small_clock_skew_and_rejects_unverified_local_link(app, users, monkeypatch):
    from app.services import auth_service
    with app.app_context():
        alice = User.query.filter_by(username='alice').one()
        alice.email = 'alice@example.test'
        alice.email_verified = False
        db.session.commit()
    calls = {}
    def verify(*args, **kwargs):
        calls.update(kwargs)
        return {'iss': 'https://accounts.google.com', 'sub': 'google-alice', 'email': 'alice@example.test', 'email_verified': True,
                'name': 'Alice'}
    monkeypatch.setattr(auth_service.id_token, 'verify_oauth2_token', verify)
    response = app.test_client().post('/api/auth/google', json={'credential': 'signed-token'})
    assert response.status_code == 401
    assert calls['clock_skew_in_seconds'] == 60
    with app.app_context():
        assert User.query.filter_by(username='alice').one().google_id is None


def test_users_cannot_change_another_users_post_or_read_draft_media(app, users):
    from PIL import Image
    with app.app_context():
        bob = User.query.filter_by(username='bob').one()
        published = Post(title='Public page', content='Published words', status='published', author_id=bob.id)
        draft = Post(title='Private page', content='Private words', status='draft', author_id=bob.id)
        db.session.add_all([published, draft]); db.session.commit()
        published_id, draft_id = published.id, draft.id
    client = app.test_client()
    alice_headers = auth(users['alice']['token'])
    bob_headers = auth(users['bob']['token'])
    assert client.put(f'/api/posts/{published_id}', headers=alice_headers, json={'title': 'Stolen'}).status_code == 403
    assert client.delete(f'/api/posts/{published_id}', headers=alice_headers).status_code == 403
    assert client.get(f'/api/posts/{draft_id}', headers=alice_headers).status_code == 404
    assert client.get(f'/api/posts/{draft_id}', headers=bob_headers).status_code == 200

    image = BytesIO()
    Image.new('RGB', (3, 3), 'white').save(image, format='JPEG'); image.seek(0)
    uploaded = client.post(f'/api/posts/{draft_id}/media', headers=bob_headers, data={
        'files': (image, 'private.jpg', 'image/jpeg'),
    }, content_type='multipart/form-data')
    assert uploaded.status_code == 201
    media_url = uploaded.get_json()['media'][0]['url']
    assert client.get(media_url).status_code == 404
    assert client.get(media_url, headers=alice_headers).status_code == 404
    assert client.get(media_url, headers=bob_headers).status_code == 200


def test_notifications_do_not_reveal_titles_after_post_becomes_draft(app, users):
    with app.app_context():
        bob = User.query.filter_by(username='bob').one()
        post = Post(title='Once public', content='A page', status='published', author_id=bob.id)
        db.session.add(post); db.session.commit()
        post_id = post.id
    client = app.test_client()
    assert client.post(f'/api/posts/{post_id}/comments', headers=auth(users['alice']['token']), json={'body': 'A kind note'}).status_code == 201
    with app.app_context():
        post = db.session.get(Post, post_id)
        post.status = 'draft'; db.session.commit()
    notifications = client.get('/api/notifications', headers=auth(users['bob']['token'])).get_json()['notifications']
    assert notifications[0]['post_id'] == post_id
    assert notifications[0]['post_title'] is None


def test_notification_delivery_failure_does_not_undo_follow(app, users, monkeypatch):
    from app.services import notification_service
    def fail_emit(*args, **kwargs):
        raise RuntimeError('simulated realtime outage')
    monkeypatch.setattr(notification_service.socketio, 'emit', fail_emit)
    response = app.test_client().post('/api/users/bob/follow', headers=auth(users['alice']['token']))
    assert response.status_code == 200
    assert response.get_json()['is_following'] is True


def test_saved_writings_are_private_and_only_published_posts_are_allowed(app, users):
    with app.app_context():
        alice = User.query.filter_by(username='alice').one()
        published = Post(title='Keep', content='words', status='published', author_id=alice.id)
        draft = Post(title='Not keep', content='draft', status='draft', author_id=alice.id)
        db.session.add_all([published, draft])
        db.session.commit()
        published_id, draft_id = published.id, draft.id
    client = app.test_client()
    saved = client.post(f'/api/users/me/saved/{published_id}', headers=auth(users['alice']['token']))
    assert saved.status_code == 201
    assert client.get('/api/users/me/saved', headers=auth(users['alice']['token'])).get_json()['posts'][0]['title'] == 'Keep'
    assert client.get('/api/users/me/saved', headers=auth(users['bob']['token'])).get_json()['posts'] == []
    assert client.post(f'/api/users/me/saved/{draft_id}', headers=auth(users['alice']['token'])).status_code == 404
    assert client.delete(f'/api/users/me/saved/{published_id}', headers=auth(users['alice']['token'])).status_code == 200
    assert client.get('/api/users/me/saved', headers=auth(users['alice']['token'])).get_json()['posts'] == []


def test_conversation_access_persistence_group_management_and_realtime(app, users):
    client = app.test_client()
    alice_token = users['alice']['token']
    bob_token = users['bob']['token']
    cara_token = users['cara']['token']
    direct = client.post('/api/conversations/direct', headers=auth(alice_token), json={'user_id': users['bob']['id']})
    assert direct.status_code == 201
    direct_id = direct.get_json()['conversation']['id']
    assert client.get(f'/api/conversations/{direct_id}/messages', headers=auth(users['cara']['token'])).status_code == 404

    alice_socket = socketio.test_client(app, auth={'token': alice_token})
    bob_socket = socketio.test_client(app, auth={'token': bob_token})
    cara_socket = socketio.test_client(app, auth={'token': cara_token})
    assert alice_socket.is_connected() and bob_socket.is_connected()
    assert alice_socket.emit('join_conversation', {'conversation_id': direct_id}, callback=True)['ok']
    assert bob_socket.emit('join_conversation', {'conversation_id': direct_id}, callback=True)['ok']
    assert not cara_socket.emit('join_conversation', {'conversation_id': direct_id}, callback=True)['ok']
    sent = alice_socket.emit('send_message', {'conversation_id': direct_id, 'body': 'still here'}, callback=True)
    assert sent['ok']
    assert any(event['name'] == 'new_message' for event in bob_socket.get_received())
    history = client.get(f'/api/conversations/{direct_id}/messages', headers=auth(bob_token)).get_json()['messages']
    assert history[0]['body'] == 'still here'
    alice_socket.disconnect(); bob_socket.disconnect(); cara_socket.disconnect()

    group = client.post('/api/conversations/groups', headers=auth(alice_token), json={
        'name': 'Night letters', 'member_ids': [users['bob']['id'], users['cara']['id']],
    })
    assert group.status_code == 201
    group_id = group.get_json()['conversation']['id']
    assert client.post(f'/api/conversations/{group_id}/messages', headers=auth(bob_token), json={'body': 'hello group'}).status_code == 201
    assert client.post(f'/api/conversations/{group_id}/participants', headers=auth(bob_token), json={'member_ids': []}).status_code == 403
    assert client.post(f'/api/conversations/{group_id}/leave', headers=auth(cara_token)).status_code == 200
    assert client.get(f'/api/conversations/{group_id}', headers=auth(cara_token)).status_code == 404


def test_group_membership_admin_actions_and_removed_member_socket_privacy(app, users):
    client = app.test_client()
    alice_token = users['alice']['token']
    bob_token = users['bob']['token']
    cara_token = users['cara']['token']
    group = client.post('/api/conversations/groups', headers=auth(alice_token), json={
        'name': 'Letters', 'member_ids': [users['bob']['id']],
    })
    assert group.status_code == 201
    group_id = group.get_json()['conversation']['id']
    alice_socket = socketio.test_client(app, auth={'token': alice_token})
    bob_socket = socketio.test_client(app, auth={'token': bob_token})
    assert alice_socket.emit('join_conversation', {'conversation_id': group_id}, callback=True)['ok']
    assert bob_socket.emit('join_conversation', {'conversation_id': group_id}, callback=True)['ok']

    added = client.post(f'/api/conversations/{group_id}/participants', headers=auth(alice_token), json={
        'member_ids': [users['cara']['id']],
    })
    assert added.status_code == 200
    assert client.get(f'/api/conversations/{group_id}', headers=auth(cara_token)).status_code == 200
    assert client.put(f'/api/conversations/{group_id}/name', headers=auth(bob_token), json={'name': 'No'}).status_code == 403
    assert client.delete(f"/api/conversations/{group_id}/participants/{users['cara']['id']}", headers=auth(bob_token)).status_code == 403
    assert client.put(f'/api/conversations/{group_id}/name', headers=auth(alice_token), json={'name': 'Night Letters'}).status_code == 200

    # Bob remains connected and in the old Socket.IO room after removal.
    assert client.delete(f"/api/conversations/{group_id}/participants/{users['bob']['id']}", headers=auth(alice_token)).status_code == 200
    assert client.get(f'/api/conversations/{group_id}/messages', headers=auth(bob_token)).status_code == 404
    assert any(event['name'] == 'conversation_removed' for event in bob_socket.get_received())
    sent = client.post(f'/api/conversations/{group_id}/messages', headers=auth(cara_token), json={'body': 'A later note'})
    assert sent.status_code == 201
    assert not any(event['name'] == 'new_message' for event in bob_socket.get_received())
    alice_socket.disconnect(); bob_socket.disconnect()


def test_sockets_require_authentication(app):
    assert not socketio.test_client(app).is_connected()
