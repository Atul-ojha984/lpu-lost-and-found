"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Authentication Classes: Dual-Mode Cookie and Header JWT Authentication
==============================================================================
"""

from rest_framework_simplejwt.authentication import JWTAuthentication

class CookieOrHeaderJWTAuthentication(JWTAuthentication):
    """
    Authenticates requests via standard Bearer token header or
    secure HttpOnly session cookie ('lpu_session_token').
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
        else:
            cookie_token = request.COOKIES.get('lpu_session_token')
            if not cookie_token:
                return None
            raw_token = cookie_token.encode('utf-8') if isinstance(cookie_token, str) else cookie_token

        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
