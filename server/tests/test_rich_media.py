from io import BytesIO
import struct

import pytest
from PIL import Image

from app import create_app, db
from app.models.post import Post
from app.models.post_engagement import PostMedia
from app.models.user import User
from app.utils.token_util import generate_jwt_token


@pytest.fixture()
def media_app(tmp_path):
    app = create_app({
        'TESTING': True,
        'MEDIA_STORAGE_BACKEND': 'local',
        'SECRET_KEY': 'rich-media-test-secret',
        'SQLALCHEMY_DATABASE_URI': 'sqlite://',
        'SQLALCHEMY_TRACK_MODIFICATIONS': False,
        'AVATAR_UPLOAD_FOLDER': str(tmp_path / 'avatars'),
        'POST_MEDIA_FOLDER': str(tmp_path / 'post-media'),
        'POST_MEDIA_MAX_IMAGE_BYTES': 32,
        'POST_MEDIA_MAX_AUDIO_BYTES': 25 * 1024 * 1024,
        'POST_MEDIA_MAX_VIDEO_BYTES': 100 * 1024 * 1024,
        'POST_MEDIA_MAX_ATTACHMENTS': 10,
    })
    with app.app_context():
        db.create_all()
        users = [User(username=name, email=f'{name}@example.test', display_name=name,
                      password_hash='hashed') for name in ('author', 'reader')]
        db.session.add_all(users)
        db.session.commit()
        ids = {user.username: user.id for user in users}
    yield app, tmp_path, ids
    with app.app_context():
        db.session.remove()
        db.drop_all()


def headers(user_id, app):
    with app.app_context():
        token = generate_jwt_token(user_id)
    return {'Authorization': f'Bearer {token}'}


def create_post(client, app, user_id, status='draft', content='Words beside the image.'):
    response = client.post('/api/posts', headers=headers(user_id, app), json={
        'title': '', 'content': content, 'status': status, 'media_pending': not bool(content),
    })
    assert response.status_code == 201
    return response.get_json()['post']['id']


def image_bytes(image_format):
    result = BytesIO()
    Image.new('RGB', (2, 2), 'white').save(result, format=image_format, quality=20)
    return result.getvalue()


def jpeg_bytes():
    return image_bytes('JPEG')


def upload(client, app, post_id, user_id, name, mime, content):
    return client.post(f'/api/posts/{post_id}/media', headers=headers(user_id, app), data={
        'files': (BytesIO(content), name, mime),
    }, content_type='multipart/form-data')


def test_supported_images_audio_and_video_are_stored_outside_database(media_app):
    app, tmp_path, ids = media_app
    client = app.test_client()
    samples = [
        ('page.jpg', 'image/jpeg', jpeg_bytes()),
        ('page.png', 'image/png', image_bytes('PNG')),
        ('page.webp', 'image/webp', image_bytes('WEBP')),
        ('song.mp3', 'audio/mpeg', b'ID3\x04\x00\x00\x00\x00\x00\x00\xff\xfb\x90\x64'),
        ('scene.mp4', 'video/mp4', struct.pack('>I4s4sI4s', 20, b'ftyp', b'mp42', 0, b'isom') + struct.pack('>I4s', 8, b'moov') + struct.pack('>I4s', 8, b'mdat')),
        ('clip.webm', 'video/webm', b'\x1a\x45\xdf\xa3' + b'\x00' * 4 + b'\x42\x82\x84webm' + b'\x00' * 4),
        ('track.wav', 'audio/wav', b'RIFF' + struct.pack('<I', 36) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 1, 8000, 8000, 1, 8) + b'data' + struct.pack('<I', 0)),
        ('recording.ogg', 'audio/ogg', b'OggS' + b'\x00' * 22 + b'\x01\x07\x01vorbis'),
        ('voice.m4a', 'audio/mp4', struct.pack('>I4s4sI4s', 20, b'ftyp', b'M4A ', 0, b'isom') + struct.pack('>I4s', 8, b'moov') + struct.pack('>I4s', 8, b'mdat')),
    ]
    post_id = create_post(client, app, ids['author'], content='')
    # The current test image limit is intentionally low; use a valid default-size limit here.
    app.config['POST_MEDIA_MAX_IMAGE_BYTES'] = 10 * 1024 * 1024
    for name, mime, content in samples:
        response = upload(client, app, post_id, ids['author'], name, mime, content)
        assert response.status_code == 201, response.get_json()
        row = response.get_json()['media'][0]
        assert row['file_size'] == len(content)
        assert row['original_name'] == name
        assert str(tmp_path) not in row['url']
        assert (tmp_path / 'post-media' / row['url'].rsplit('/', 1)[1]).is_file()
    with app.app_context():
        assert PostMedia.query.filter_by(post_id=post_id).count() == len(samples)
    assert client.put(f'/api/posts/{post_id}', headers=headers(ids['author'], app), json={
        'title': '', 'content': '', 'status': 'published',
    }).status_code == 200
    feed_post = client.get('/api/posts').get_json()['posts'][0]
    assert feed_post['content'] == '' and len(feed_post['media']) == len(samples)


def test_rejects_unsupported_extension_bad_mime_corrupt_content_and_size(media_app):
    app, _, ids = media_app
    client = app.test_client()
    post_id = create_post(client, app, ids['author'])
    assert upload(client, app, post_id, ids['author'], 'movie.mov', 'video/quicktime', b'data').status_code == 400
    assert upload(client, app, post_id, ids['author'], 'photo.jpg', 'image/png', jpeg_bytes()).status_code == 400
    assert upload(client, app, post_id, ids['author'], 'broken.jpg', 'image/jpeg', b'not an image').status_code == 400
    assert upload(client, app, post_id, ids['author'], 'large.jpg', 'image/jpeg', b'x' * 33).status_code == 400


def test_audio_and_video_size_limits_are_applied_per_type(media_app):
    app, _, ids = media_app
    client = app.test_client()
    app.config['POST_MEDIA_MAX_AUDIO_BYTES'] = 32
    app.config['POST_MEDIA_MAX_VIDEO_BYTES'] = 32
    post_id = create_post(client, app, ids['author'])
    assert upload(client, app, post_id, ids['author'], 'large.mp3', 'audio/mpeg', b'x' * 33).status_code == 400
    assert upload(client, app, post_id, ids['author'], 'large.mp4', 'video/mp4', b'x' * 33).status_code == 400


def test_failed_multi_file_upload_cleans_files_saved_earlier_in_request(media_app):
    app, tmp_path, ids = media_app
    app.config['POST_MEDIA_MAX_IMAGE_BYTES'] = 10 * 1024 * 1024
    client = app.test_client()
    post_id = create_post(client, app, ids['author'])
    response = client.post(f'/api/posts/{post_id}/media', headers=headers(ids['author'], app), data={
        'files': [
            (BytesIO(jpeg_bytes()), 'good.jpg', 'image/jpeg'),
            (BytesIO(b'not an image'), 'bad.jpg', 'image/jpeg'),
        ],
    }, content_type='multipart/form-data')
    assert response.status_code == 400
    assert list((tmp_path / 'post-media').glob('*')) == []
    with app.app_context():
        assert PostMedia.query.filter_by(post_id=post_id).count() == 0


def test_requires_auth_and_checks_media_ownership(media_app):
    _, _, ids = media_app
    client = media_app[0].test_client()
    app = media_app[0]
    post_id = create_post(client, app, ids['author'])
    assert client.post(f'/api/posts/{post_id}/media', data={
        'files': (BytesIO(jpeg_bytes()), 'page.jpg', 'image/jpeg'),
    }, content_type='multipart/form-data').status_code == 401
    assert upload(client, app, post_id, ids['reader'], 'page.jpg', 'image/jpeg', jpeg_bytes()).status_code == 404


def test_draft_media_private_until_published_and_order_delete_work(media_app):
    app, tmp_path, ids = media_app
    client = app.test_client()
    app.config['POST_MEDIA_MAX_IMAGE_BYTES'] = 10 * 1024 * 1024
    post_id = create_post(client, app, ids['author'])
    first = upload(client, app, post_id, ids['author'], 'one.jpg', 'image/jpeg', jpeg_bytes()).get_json()['media'][0]
    second = upload(client, app, post_id, ids['author'], 'two.jpg', 'image/jpeg', jpeg_bytes()).get_json()['media'][0]
    assert client.get(first['url']).status_code == 404
    assert client.get(first['url'], headers=headers(ids['reader'], app)).status_code == 404
    assert client.get(first['url'], headers=headers(ids['author'], app)).status_code == 200
    reordered = client.put(f'/api/posts/{post_id}/media/reorder', headers=headers(ids['author'], app), json={
        'order': [second['id'], first['id']],
    })
    assert reordered.status_code == 200
    assert [row['id'] for row in reordered.get_json()['media']] == [second['id'], first['id']]
    assert client.put(f'/api/posts/{post_id}/media/reorder', headers=headers(ids['author'], app), json={'order': [first['id']]}).status_code == 400
    assert client.put(f'/api/posts/{post_id}', headers=headers(ids['author'], app), json={'content': 'published', 'status': 'published'}).status_code == 200
    assert client.get(first['url']).status_code == 200
    disk_path = tmp_path / 'post-media' / first['url'].rsplit('/', 1)[1]
    assert client.delete(f"/api/posts/{post_id}/media/{first['id']}", headers=headers(ids['author'], app)).status_code == 200
    assert not disk_path.exists()
    assert client.get(f'/api/posts/{post_id}/media').get_json()['media'][0]['id'] == second['id']


def test_post_deletion_removes_media_files(media_app):
    app, tmp_path, ids = media_app
    app.config['POST_MEDIA_MAX_IMAGE_BYTES'] = 10 * 1024 * 1024
    client = app.test_client()
    post_id = create_post(client, app, ids['author'])
    media = upload(client, app, post_id, ids['author'], 'page.jpg', 'image/jpeg', jpeg_bytes()).get_json()['media'][0]
    path = tmp_path / 'post-media' / media['url'].rsplit('/', 1)[1]
    assert path.exists()
    assert client.delete(f'/api/posts/{post_id}', headers=headers(ids['author'], app)).status_code == 200
    assert not path.exists()


def test_missing_media_file_returns_safe_404(media_app):
    app, tmp_path, ids = media_app
    app.config['POST_MEDIA_MAX_IMAGE_BYTES'] = 10 * 1024 * 1024
    client = app.test_client()
    post_id = create_post(client, app, ids['author'], status='published')
    media = upload(client, app, post_id, ids['author'], 'page.jpg', 'image/jpeg', jpeg_bytes()).get_json()['media'][0]
    path = tmp_path / 'post-media' / media['url'].rsplit('/', 1)[1]
    path.unlink()
    response = client.get(media['url'])
    assert response.status_code == 404
    assert str(tmp_path) not in response.get_data(as_text=True)


def test_conversation_media_persists_and_is_private_to_members(media_app):
    app, tmp_path, ids = media_app
    app.config['POST_MEDIA_MAX_IMAGE_BYTES'] = 10 * 1024 * 1024
    with app.app_context():
        outsider = User(username='outsider', email='outsider@example.test', display_name='outsider', password_hash='hashed')
        db.session.add(outsider)
        db.session.commit()
        outsider_id = outsider.id
    client = app.test_client()
    conversation = client.post('/api/conversations/direct', headers=headers(ids['author'], app), json={
        'user_id': ids['reader'],
    }).get_json()['conversation']
    sent = client.post(f"/api/conversations/{conversation['id']}/messages", headers=headers(ids['author'], app), data={
        'body': 'A photo for you',
        'files': (BytesIO(jpeg_bytes()), 'note.jpg', 'image/jpeg'),
    }, content_type='multipart/form-data')
    assert sent.status_code == 201, sent.get_json()
    payload = sent.get_json()['message']
    assert payload['body'] == 'A photo for you' and len(payload['media']) == 1
    media = payload['media'][0]
    assert media['original_name'] == 'note.jpg' and media['file_size'] > 0
    assert (tmp_path / 'post-media' / 'conversations' / media['url'].rsplit('/', 1)[1]).is_file()
    assert client.get(media['url']).status_code == 401
    assert client.get(media['url'], headers=headers(outsider_id, app)).status_code == 404
    assert client.get(media['url'], headers=headers(ids['reader'], app)).status_code == 200
    history = client.get(f"/api/conversations/{conversation['id']}/messages", headers=headers(ids['reader'], app))
    assert history.get_json()['messages'][0]['media'][0]['id'] == media['id']

    group = client.post('/api/conversations/groups', headers=headers(ids['author'], app), json={
        'name': 'Quiet room', 'member_ids': [ids['reader']],
    }).get_json()['conversation']
    media_only = client.post(f"/api/conversations/{group['id']}/messages", headers=headers(ids['author'], app), data={
        'body': '', 'files': (BytesIO(jpeg_bytes()), 'moment.jpg', 'image/jpeg'),
    }, content_type='multipart/form-data')
    assert media_only.status_code == 201
    assert media_only.get_json()['message']['body'] == ''
    assert client.get(media_only.get_json()['message']['media'][0]['url'], headers=headers(ids['reader'], app)).status_code == 200


def test_group_admin_can_update_name_and_picture_while_members_cannot(media_app):
    app, tmp_path, ids = media_app
    client = app.test_client()
    group = client.post('/api/conversations/groups', headers=headers(ids['author'], app), json={
        'name': 'First name', 'member_ids': [ids['reader']],
    })
    assert group.status_code == 201
    group_id = group.get_json()['conversation']['id']

    details_url = f'/api/conversations/{group_id}/details'
    denied_details = client.put(details_url, headers=headers(ids['reader'], app), json={
        'name': 'Changed by member', 'description': 'Not allowed',
    })
    assert denied_details.status_code == 403
    updated = client.put(details_url, headers=headers(ids['author'], app), json={
        'name': 'Updated name', 'description': 'A short group description',
    })
    assert updated.status_code == 200
    assert updated.get_json()['conversation']['name'] == 'Updated name'
    assert updated.get_json()['conversation']['description'] == 'A short group description'

    avatar_url = f'/api/conversations/{group_id}/group-avatar'
    denied_picture = client.post(avatar_url, headers=headers(ids['reader'], app), data={
        'avatar': (BytesIO(jpeg_bytes()), 'group.jpg', 'image/jpeg'),
    }, content_type='multipart/form-data')
    assert denied_picture.status_code == 403

    uploaded = client.post(avatar_url, headers=headers(ids['author'], app), data={
        'avatar': (BytesIO(jpeg_bytes()), 'group.jpg', 'image/jpeg'),
    }, content_type='multipart/form-data')
    assert uploaded.status_code == 200, uploaded.get_json()
    conversation = uploaded.get_json()['conversation']
    assert conversation['avatar_url']
    assert client.get(conversation['avatar_url'], headers=headers(ids['reader'], app)).status_code == 200
    assert (tmp_path / 'post-media' / 'conversations' / conversation['avatar_url'].rsplit('/', 1)[1]).is_file()

    removed = client.delete(avatar_url, headers=headers(ids['author'], app))
    assert removed.status_code == 200
    assert removed.get_json()['conversation']['avatar_url'] is None


def test_conversation_media_validates_type_and_rejects_empty_message(media_app):
    app, _, ids = media_app
    client = app.test_client()
    conversation = client.post('/api/conversations/direct', headers=headers(ids['author'], app), json={
        'user_id': ids['reader'],
    }).get_json()['conversation']
    url = f"/api/conversations/{conversation['id']}/messages"
    empty = client.post(url, headers=headers(ids['author'], app), data={'body': '   '}, content_type='multipart/form-data')
    assert empty.status_code == 400
    bad = client.post(url, headers=headers(ids['author'], app), data={
        'body': '', 'files': (BytesIO(b'not a video'), 'clip.mov', 'video/quicktime'),
    }, content_type='multipart/form-data')
    assert bad.status_code == 400
    assert client.get(url, headers=headers(ids['reader'], app)).status_code == 200
