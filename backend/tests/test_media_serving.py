from django.test import RequestFactory
from django.urls import resolve
from django.views.static import serve


def test_uploaded_listing_media_uses_media_route(tmp_path):
    media_path = tmp_path / 'listing-image.webp'
    media_path.write_bytes(b'cleaned-image-content')

    match = resolve('/media/listing-image.webp')
    assert match.func is serve

    response = match.func(
        RequestFactory().get('/media/listing-image.webp'),
        **{**match.kwargs, 'document_root': str(tmp_path)},
    )

    assert response.status_code == 200
    assert b''.join(response.streaming_content) == b'cleaned-image-content'
