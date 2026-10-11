/**
 * User service with async database operations using SQLx and Tokio.
 * Provides CRUD operations, authentication, and session management.
 */
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool, Row};
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use std::sync::Arc;
use tokio::sync::RwLock;
use thiserror::Error;
use validator::Validate;

/// User role enumeration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "user_role", rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    User,
    Moderator,
    Guest,
}

/// User account status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "user_status", rename_all = "lowercase")]
pub enum UserStatus {
    Active,
    Inactive,
    Suspended,
    PendingVerification,
}

/// User model
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub full_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
    pub role: UserRole,
    pub status: UserStatus,
    pub is_verified: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// User session for authentication
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserSession {
    pub id: Uuid,
    pub user_id: Uuid,
    pub token_hash: String,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// User preferences
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct UserPreferences {
    pub id: Uuid,
    pub user_id: Uuid,
    pub theme: String,
    pub language: String,
    pub notifications_enabled: bool,
    pub email_notifications: bool,
    pub timezone: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// JWT claims
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,      // user id
    pub email: String,
    pub role: UserRole,
    pub exp: i64,
    pub iat: i64,
    pub jti: String,      // unique token ID
}

/// User registration input
#[derive(Debug, Deserialize, Validate)]
pub struct UserCreate {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 3, max = 50))]
    pub username: String,
    #[validate(length(min = 8, max = 128))]
    pub password: String,
    #[validate(length(max = 100))]
    pub full_name: Option<String>,
}

/// User profile update
#[derive(Debug, Deserialize, Validate)]
pub struct UserUpdate {
    #[validate(length(max = 100))]
    pub full_name: Option<String>,
    #[validate(length(max = 500))]
    pub bio: Option<String>,
    #[validate(length(max = 500))]
    pub avatar_url: Option<String>,
    #[validate(regex = "THEME_REGEX")]
    pub theme: Option<String>,
    #[validate(length(max = 10))]
    pub language: Option<String>,
    pub notifications_enabled: Option<bool>,
    pub email_notifications: Option<bool>,
    #[validate(length(max = 50))]
    pub timezone: Option<String>,
}

const THEME_REGEX: &str = r"^(light|dark|system)$";

/// Service errors
#[derive(Debug, Error)]
pub enum UserServiceError {
    #[error("User not found")]
    NotFound,
    #[error("Email or username already exists")]
    Conflict,
    #[error("Invalid credentials")]
    InvalidCredentials,
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
    #[error("Bcrypt error: {0}")]
    Bcrypt(#[from] bcrypt::BcryptError),
}

/// User service
pub struct UserService {
    pool: PgPool,
    jwt_secret: Arc<RwLock<String>>,
    token_expiry_hours: i64,
}

impl UserService {
    /// Create a new user service
    pub fn new(pool: PgPool, jwt_secret: String, token_expiry_hours: i64) -> Self {
        Self {
            pool,
            jwt_secret: Arc::new(RwLock::new(jwt_secret)),
            token_expiry_hours,
        }
    }

    /// Hash password using bcrypt
    pub async fn hash_password(password: &str) -> Result<String, UserServiceError> {
        let hash = tokio::task::spawn_blocking({
            let password = password.to_string();
            move || hash(password, DEFAULT_COST)
        }).await??;
        Ok(hash)
    }

    /// Verify password against hash
    pub async fn verify_password(password: &str, hash: &str) -> Result<bool, UserServiceError> {
        let password = password.to_string();
        let hash = hash.to_string();
        let valid = tokio::task::spawn_blocking(move || verify(password, &hash)).await??;
        Ok(valid)
    }

    /// Create a new user
    pub async fn create_user(&self, input: UserCreate) -> Result<User, UserServiceError> {
        // Validate input
        input.validate().map_err(|e| UserServiceError::Validation(e.to_string()))?;

        // Check for existing user
        let existing = sqlx::query!(
            "SELECT id FROM users WHERE email = $1 OR username = $2",
            input.email, input.username
        )
        .fetch_optional(&self.pool)
        .await?;

        if existing.is_some() {
            return Err(UserServiceError::Conflict);
        }

        let password_hash = Self::hash_password(&input.password).await?;
        let user_id = Uuid::new_v4();
        let now = Utc::now();

        // Insert user
        sqlx::query!(
            r#"
            INSERT INTO users (id, email, username, password_hash, full_name, role, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
            user_id,
            input.email,
            input.username,
            password_hash,
            input.full_name,
            UserRole::User as _,
            UserStatus::PendingVerification as _,
            now,
            now
        )
        .execute(&self.pool)
        .await?;

        // Create default preferences
        sqlx::query!(
            r#"
            INSERT INTO user_preferences (id, user_id, theme, language, notifications_enabled, email_notifications, timezone, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            "#,
            Uuid::new_v4(),
            user_id,
            "system",
            "en",
            true,
            true,
            "UTC",
            now,
            now
        )
        .execute(&self.pool)
        .await?;

        // Return created user
        self.get_user_by_id(user_id).await
    }

    /// Authenticate user
    pub async fn authenticate(&self, email: &str, password: &str) -> Result<User, UserServiceError> {
        let user = sqlx::query_as!(User, "SELECT * FROM users WHERE email = $1", email)
            .fetch_optional(&self.pool)
            .await?;

        let user = user.ok_or(UserServiceError::InvalidCredentials)?;

        if user.status != UserStatus::Active {
            return Err(UserServiceError::InvalidCredentials);
        }

        if !Self::verify_password(password, &user.password_hash).await? {
            return Err(UserServiceError::InvalidCredentials);
        }

        // Update last login
        sqlx::query!(
            "UPDATE users SET last_login = $1, updated_at = $1 WHERE id = $2",
            Utc::now(),
            user.id
        )
        .execute(&self.pool)
        .await?;

        Ok(user)
    }

    /// Create session and return JWT
    pub async fn create_session(&self, user: &User, ip_address: Option<String>, user_agent: Option<String>) -> Result<String, UserServiceError> {
        let token = Uuid::new_v4().to_string();
        let token_hash = Self::hash_token(&token);
        let expires_at = Utc::now() + Duration::hours(self.token_expiry_hours);
        let session_id = Uuid::new_v4();

        sqlx::query!(
            r#"
            INSERT INTO user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#,
            session_id,
            user.id,
            token_hash,
            ip_address,
            user_agent,
            expires_at,
            Utc::now()
        )
        .execute(&self.pool)
        .await?;

        // Generate JWT
        let claims = Claims {
            sub: user.id.to_string(),
            email: user.email.clone(),
            role: user.role,
            exp: expires_at.timestamp(),
            iat: Utc::now().timestamp(),
            jti: Uuid::new_v4().to_string(),
        };

        let secret = self.jwt_secret.read().await;
        let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))?;
        Ok(token)
    }

    /// Hash token for storage
    fn hash_token(token: &str) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Validate JWT token
    pub async fn validate_token(&self, token: &str) -> Result<Claims, UserServiceError> {
        let secret = self.jwt_secret.read().await;
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &Validation::new(Algorithm::HS256)
        )?;

        let claims = token_data.claims;

        // Verify session exists and not expired
        let token_hash = Self::hash_token(token);
        let session = sqlx::query!(
            "SELECT id FROM user_sessions WHERE token_hash = $1 AND expires_at > $2",
            token_hash,
            Utc::now()
        )
        .fetch_optional(&self.pool)
        .await?;

        if session.is_none() {
            return Err(UserServiceError::InvalidCredentials);
        }

        Ok(claims)
    }

    /// Get user by ID
    pub async fn get_user_by_id(&self, user_id: Uuid) -> Result<User, UserServiceError> {
        let user = sqlx::query_as!(User, "SELECT * FROM users WHERE id = $1", user_id)
            .fetch_optional(&self.pool)
            .await?
            .ok_or(UserServiceError::NotFound)?;
        Ok(user)
    }

    /// Update user profile
    pub async fn update_user(&self, user_id: Uuid, input: UserUpdate) -> Result<User, UserServiceError> {
        input.validate().map_err(|e| UserServiceError::Validation(e.to_string()))?;

        let mut user = self.get_user_by_id(user_id).await?;
        let now = Utc::now();

        // Update user fields
        if let Some(full_name) = input.full_name {
            user.full_name = Some(full_name);
        }
        if let Some(bio) = input.bio {
            user.bio = Some(bio);
        }
        if let Some(avatar_url) = input.avatar_url {
            user.avatar_url = Some(avatar_url);
        }

        sqlx::query!(
            r#"
            UPDATE users SET full_name = $1, bio = $2, avatar_url = $3, updated_at = $4
            WHERE id = $5
            "#,
            user.full_name, user.bio, user.avatar_url, now, user_id
        )
        .execute(&self.pool)
        .await?;

        // Update preferences
        if input.theme.is_some() || input.language.is_some() || input.notifications_enabled.is_some() ||
           input.email_notifications.is_some() || input.timezone.is_some() {
            
            sqlx::query!(
                r#"
                UPDATE user_preferences SET 
                    theme = COALESCE($1, theme),
                    language = COALESCE($2, language),
                    notifications_enabled = COALESCE($3, notifications_enabled),
                    email_notifications = COALESCE($4, email_notifications),
                    timezone = COALESCE($5, timezone),
                    updated_at = $6
                WHERE user_id = $7
                "#,
                input.theme, input.language, input.notifications_enabled,
                input.email_notifications, input.timezone, now, user_id
            )
            .execute(&self.pool)
            .await?;
        }

        self.get_user_by_id(user_id).await
    }

    /// Soft delete user
    pub async fn delete_user(&self, user_id: Uuid) -> Result<bool, UserServiceError> {
        let result = sqlx::query!(
            "UPDATE users SET status = $1, updated_at = $2 WHERE id = $3",
            UserStatus::Inactive as _,
            Utc::now(),
            user_id
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// List users with pagination
    pub async fn list_users(&self, skip: i64, limit: i64, role: Option<UserRole>, status: Option<UserStatus>) -> Result<Vec<User>, UserServiceError> {
        let mut query = String::from("SELECT * FROM users WHERE 1=1");
        let mut params: Vec<Box<dyn sqlx::Encode<'_, sqlx::Postgres> + Send + Sync>> = Vec::new();
        let mut param_idx = 1;

        if let Some(role) = role {
            query.push_str(&format!(" AND role = ${}", param_idx));
            params.push(Box::new(role));
            param_idx += 1;
        }
        if let Some(status) = status {
            query.push_str(&format!(" AND status = ${}", param_idx));
            params.push(Box::new(status));
            param_idx += 1;
        }

        query.push_str(&format!(" ORDER BY created_at DESC LIMIT ${} OFFSET ${}", param_idx, param_idx + 1));
        params.push(Box::new(limit));
        params.push(Box::new(skip));

        // Note: This is simplified - in practice use query_as with proper binding
        let users = sqlx::query_as!(User, "SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2", limit, skip)
            .fetch_all(&self.pool)
            .await?;

        Ok(users)
    }
}

impl User {
    /// Create a safe public representation of the user (no password hash)
    pub fn public(&self) -> PublicUser {
        PublicUser {
            id: self.id,
            email: self.email.clone(),
            username: self.username.clone(),
            full_name: self.full_name.clone(),
            bio: self.bio.clone(),
            avatar_url: self.avatar_url.clone(),
            role: self.role,
            status: self.status,
            is_verified: self.is_verified,
            last_login: self.last_login,
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
}

/// Public user representation (no sensitive data)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicUser {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub full_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_url: Option<String>,
    pub role: UserRole,
    pub status: UserStatus,
    pub is_verified: bool,
    pub last_login: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// TODO: Add password reset with secure tokens
// TODO: Add OAuth2 provider integration
// TODO: Add rate limiting for auth endpoints
// FIXME: Handle concurrent session limits per user
// NOTE: Consider adding audit logging for security events