"""
==============================================================================
LPU Lost & Found Property Recovery Platform
Authentication Views & JWT Handlers
==============================================================================
"""

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiResponse

from .serializers import RegisterSerializer, LoginSerializer, UserSerializer

def set_auth_cookie(response, token_str: str):
    """Sets secure HttpOnly session cookie matching Express configuration."""
    is_prod = not settings.DEBUG
    response.set_cookie(
        key='lpu_session_token',
        value=token_str,
        max_age=7 * 24 * 3600,
        httponly=True,
        secure=is_prod,
        samesite='Strict' if is_prod else 'Lax',
    )

class RegisterAPIView(APIView):
    """Public registration endpoint for university students and staff."""
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Authentication'],
        summary='Register Student / Staff Account',
        request=RegisterSerializer,
        responses={201: OpenApiResponse(description='Account created successfully')}
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        user_data = UserSerializer(user).data
        res = Response(
            {
                'user': user_data,
                'token': access_token,
            },
            status=status.HTTP_201_CREATED
        )
        set_auth_cookie(res, access_token)
        return res

class LoginAPIView(APIView):
    """Authentication endpoint accepting email or student registration number."""
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Authentication'],
        summary='Login to Campus Portal',
        request=LoginSerializer,
        responses={200: OpenApiResponse(description='Login successful')}
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']

        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)

        user_data = UserSerializer(user).data
        res = Response(
            {
                'user': user_data,
                'token': access_token,
            },
            status=status.HTTP_200_OK
        )
        set_auth_cookie(res, access_token)
        return res

class LogoutAPIView(APIView):
    """Session invalidation endpoint clearing HttpOnly cookie."""
    permission_classes = [AllowAny]

    @extend_schema(
        tags=['Authentication'],
        summary='Sign out from session',
        responses={200: OpenApiResponse(description='Logged out successfully')}
    )
    def post(self, request):
        res = Response({'message': 'Logged out successfully.'}, status=status.HTTP_200_OK)
        res.delete_cookie('lpu_session_token')
        return res

class CurrentUserAPIView(APIView):
    """Session profile inspection endpoint returning authenticated user details."""
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Authentication'],
        summary='Get Current User Profile',
        responses={200: UserSerializer}
    )
    def get(self, request):
        user_data = UserSerializer(request.user).data
        return Response({'user': user_data}, status=status.HTTP_200_OK)
