from io import BytesIO
from PIL import Image, UnidentifiedImageError


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


def validate_media_content(extension, content, expected_image_format=None):
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
    return (value >> 21 == 0x7ff and ((value >> 19) & 0b11) != 0b01
            and ((value >> 17) & 0b11) != 0 and ((value >> 12) & 0b1111) not in (0, 15)
            and ((value >> 10) & 0b11) != 0b11)


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
