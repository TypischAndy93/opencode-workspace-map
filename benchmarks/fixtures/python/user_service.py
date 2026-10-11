"""
User management service with database operations and validation.
Handles CRUD operations, authentication, and profile management.
"""
from __future__ import annotations

import hashlib
import secrets
import re
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod

# Third-party imports
import bcrypt
import jwt
from pydantic import BaseModel, EmailStr, Field, validator
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship, Session
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class UserRole(str, Enum):
    """User role enumeration."""
    ADMIN = "admin"
    USER = "user"
    MODERATOR = "moderator"
    GUEST = "guest"


class UserStatus(str, Enum):
    """User account status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING_VERIFICATION = "pending_verification"


@dataclass
class User(Base):
    """User model with profile and authentication fields."""
    __tablename__ = "users"
    
    id: int = Column(Integer, primary_key=True, autoincrement=True)
    email: str = Column(String(255), unique=True, nullable=False, index=True)
    username: str = Column(String(50), unique=True, nullable=False, index=True)
    password_hash: str = Column(String(255), nullable=False)
    full_name: Optional[str] = Column(String(100), nullable=True)
    bio: Optional[str] = Column(Text, nullable=True)
    avatar_url: Optional[str] = Column(String(500), nullable=True)
    role: UserRole = Column(String(20), default=UserRole.USER, nullable=False)
    status: UserStatus = Column(String(30), default=UserStatus.PENDING_VERIFICATION, nullable=False)
    is_verified: bool = Column(Boolean, default=False, nullable=False)
    last_login: Optional[datetime] = Column(DateTime, nullable=True)
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: datetime = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    sessions: List[UserSession] = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    preferences: Optional[UserPreferences] = relationship("UserPreferences", back_populates="user", uselist=False, cascade="all, delete-orphan")


@dataclass
class UserSession(Base):
    """User session for authentication tracking."""
    __tablename__ = "user_sessions"
    
    id: int = Column(Integer, primary_key=True, autoincrement=True)
    user_id: int = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: str = Column(String(255), nullable=False, unique=True, index=True)
    ip_address: Optional[str] = Column(String(45), nullable=True)
    user_agent: Optional[str] = Column(Text, nullable=True)
    expires_at: datetime = Column(DateTime, nullable=False, index=True)
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    user: User = relationship("User", back_populates="sessions")


@dataclass
class UserPreferences(Base):
    """User preferences and settings."""
    __tablename__ = "user_preferences"
    
    id: int = Column(Integer, primary_key=True, autoincrement=True)
    user_id: int = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    theme: str = Column(String(20), default="system", nullable=False)
    language: str = Column(String(10), default="en", nullable=False)
    notifications_enabled: bool = Column(Boolean, default=True, nullable=False)
    email_notifications: bool = Column(Boolean, default=True, nullable=False)
    timezone: str = Column(String(50), default="UTC", nullable=False)
    created_at: datetime = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: datetime = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    user: User = relationship("User", back_populates="preferences")


# Pydantic models for validation
class UserCreate(BaseModel):
    """User registration input validation."""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50, pattern=r'^[a-zA-Z0-9_]+$')
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=100)
    
    @validator('password')
    def password_strength(cls, v):
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain at least one special character')
        return v


class UserUpdate(BaseModel):
    """User profile update validation."""
    full_name: Optional[str] = Field(None, max_length=100)
    bio: Optional[str] = Field(None, max_length=500)
    avatar_url: Optional[str] = Field(None, max_length=500)
    theme: Optional[str] = Field(None, pattern=r'^(light|dark|system)$')
    language: Optional[str] = Field(None, max_length=10)
    notifications_enabled: Optional[bool] = None
    email_notifications: Optional[bool] = None
    timezone: Optional[str] = Field(None, max_length=50)


class TokenPayload(BaseModel):
    """JWT token payload."""
    sub: int  # user id
    email: EmailStr
    role: UserRole
    exp: int
    iat: int
    jti: str  # unique token identifier


class UserService:
    """User management service with business logic."""
    
    def __init__(self, db: Session, jwt_secret: str, token_expiry_hours: int = 24):
        self.db = db
        self.jwt_secret = jwt_secret
        self.token_expiry_hours = token_expiry_hours
    
    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt."""
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def verify_password(self, password: str, password_hash: str) -> bool:
        """Verify password against hash."""
        return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))
    
    def create_user(self, user_data: UserCreate) -> User:
        """Create a new user account."""
        # Check for existing email/username
        existing = self.db.query(User).filter(
            (User.email == user_data.email) | (User.username == user_data.username)
        ).first()
        if existing:
            raise ValueError("Email or username already exists")
        
        password_hash = self.hash_password(user_data.password)
        
        user = User(
            email=user_data.email,
            username=user_data.username,
            password_hash=password_hash,
            full_name=user_data.full_name,
        )
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        
        # Create default preferences
        prefs = UserPreferences(user_id=user.id)
        self.db.add(prefs)
        self.db.commit()
        
        return user
    
    def authenticate(self, email: str, password: str) -> Optional[User]:
        """Authenticate user and return user if valid."""
        user = self.db.query(User).filter(User.email == email).first()
        if not user or user.status != UserStatus.ACTIVE:
            return None
        
        if not self.verify_password(password, user.password_hash):
            return None
        
        user.last_login = datetime.utcnow()
        self.db.commit()
        return user
    
    def create_session(self, user: User, ip_address: Optional[str] = None, user_agent: Optional[str] = None) -> str:
        """Create a new session and return JWT token."""
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        expires_at = datetime.utcnow() + timedelta(hours=self.token_expiry_hours)
        
        session = UserSession(
            user_id=user.id,
            token_hash=token_hash,
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=expires_at,
        )
        
        self.db.add(session)
        self.db.commit()
        
        # Create JWT
        payload = TokenPayload(
            sub=user.id,
            email=user.email,
            role=user.role,
            exp=int(expires_at.timestamp()),
            iat=int(datetime.utcnow().timestamp()),
            jti=secrets.token_urlsafe(16),
        )
        
        jwt_token = jwt.encode(payload.dict(), self.jwt_secret, algorithm='HS256')
        return jwt_token
    
    def validate_token(self, token: str) -> Optional[TokenPayload]:
        """Validate JWT token and return payload."""
        try:
            payload = jwt.decode(token, self.jwt_secret, algorithms=['HS256'])
            
            # Check session exists and not expired
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            session = self.db.query(UserSession).filter(
                UserSession.token_hash == token_hash,
                UserSession.expires_at > datetime.utcnow()
            ).first()
            
            if not session:
                return None
            
            return TokenPayload(**payload)
        except jwt.PyJWTError:
            return None
    
    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID."""
        return self.db.query(User).filter(User.id == user_id).first()
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        return self.db.query(User).filter(User.email == email).first()
    
    def update_user(self, user_id: int, update_data: UserUpdate) -> Optional[User]:
        """Update user profile."""
        user = self.get_user_by_id(user_id)
        if not user:
            return None
        
        update_dict = update_data.dict(exclude_unset=True)
        
        # Handle preferences separately
        prefs_fields = {'theme', 'language', 'notifications_enabled', 'email_notifications', 'timezone'}
        prefs_data = {k: v for k, v in update_dict.items() if k in prefs_fields}
        user_data = {k: v for k, v in update_dict.items() if k not in prefs_fields}
        
        for key, value in user_data.items():
            setattr(user, key, value)
        
        if prefs_data and user.preferences:
            for key, value in prefs_data.items():
                setattr(user.preferences, key, value)
        
        user.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(user)
        return user
    
    def delete_user(self, user_id: int) -> bool:
        """Soft delete user (mark as inactive)."""
        user = self.get_user_by_id(user_id)
        if not user:
            return False
        
        user.status = UserStatus.INACTIVE
        user.updated_at = datetime.utcnow()
        self.db.commit()
        return True
    
    def list_users(
        self,
        skip: int = 0,
        limit: int = 50,
        role: Optional[UserRole] = None,
        status: Optional[UserStatus] = None
    ) -> List[User]:
        """List users with optional filters."""
        query = self.db.query(User)
        
        if role:
            query = query.filter(User.role == role)
        if status:
            query = query.filter(User.status == status)
        
        return query.order_by(User.created_at.desc()).offset(skip).limit(limit).all()
    
    def change_password(self, user_id: int, current_password: str, new_password: str) -> bool:
        """Change user password."""
        user = self.get_user_by_id(user_id)
        if not user or not self.verify_password(current_password, user.password_hash):
            return False
        
        # Validate new password
        validator = UserCreate.__fields__['password'].type_
        if isinstance(validator, type) and hasattr(validator, '__call__'):
            validator(new_password)  # This would need proper validation
        
        user.password_hash = self.hash_password(new_password)
        user.updated_at = datetime.utcnow()
        
        # Invalidate all sessions
        self.db.query(UserSession).filter(UserSession.user_id == user_id).delete()
        
        self.db.commit()
        return True


# TODO: Add password reset flow with email tokens
# TODO: Add OAuth2 integration (Google, GitHub, etc.)
# FIXME: Handle race conditions in session creation
# NOTE: Consider adding rate limiting for authentication endpoints