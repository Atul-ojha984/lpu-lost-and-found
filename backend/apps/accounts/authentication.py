"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Authentication Classes: Dual-Mode Cookie and Header JWT Authentication
==============================================================================
"""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
from rest_framework.authentication import SessionAuthentication

class CookieOrHeaderJWTAuthentication(JWTAuthentication):
    """
    Authenticates requests via standard Bearer token header or
    secure HttpOnly session cookie ('lpu_session_token').
    """

    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is None:
                return None
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        else:
            cookie_token = request.COOKIES.get('lpu_session_token')
            if not cookie_token:
                return None
            try:
                raw_token = cookie_token.encode('utf-8') if isinstance(cookie_token, str) else cookie_token
                validated_token = self.get_validated_token(raw_token)
            except InvalidToken:
                # Ambient expired/stale cookie should not crash public unauthenticated requests
                return None
            if request.method not in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
                SessionAuthentication().enforce_csrf(request)
            return self.get_user(validated_token), validated_token

    def get_user(self, validated_token):
        """
        Find and return user supporting either 'userId' or 'user_id' claim.
        """
        user_id = validated_token.get('userId') or validated_token.get('user_id')
        if not user_id:
            raise InvalidToken("Token contained no recognizable user identification")

        try:
            user = self.user_model.objects.get(id=user_id)
        except self.user_model.DoesNotExist:
            raise AuthenticationFailed("User account was not found", code="user_not_found")

        if not user.is_active:
            raise AuthenticationFailed("User account is inactive or suspended", code="user_inactive")

        try:
            token_version = int(validated_token.get('authVersion', 0))
        except (TypeError, ValueError):
            raise AuthenticationFailed("Token authorization version is invalid", code="token_revoked")
        if token_version != user.auth_token_version:
            raise AuthenticationFailed("User session has been revoked", code="token_revoked")

        return user
