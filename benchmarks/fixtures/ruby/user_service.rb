# frozen_string_literal: true

# User service for managing user accounts and profiles.
# Provides CRUD operations, authentication, and session management.
module UserService
  class << self
    # Registers a new user account.
    #
    # @param email [String] User's email address
    # @param username [String] Desired username
    # @param password [String] Plain text password
    # @param full_name [String, nil] Optional full name
    # @return [User] The created user
    # @raise [ArgumentError] If email or username already exists
    def register(email, username, password, full_name = nil)
      raise ArgumentError, "Email already registered: #{email}" if User.exists?(email: email)
      raise ArgumentError, "Username already taken: #{username}" if User.exists?(username: username)

      password_hash = PasswordEncoder.hash(password)

      user = User.create!(
        email: email,
        username: username,
        password_hash: password_hash,
        full_name: full_name,
        role: :user,
        status: :pending_verification
      )

      Rails.logger.info("User registered: #{user.id}")
      user
    end

    # Authenticates a user with email and password.
    #
    # @param email [String] User's email
    # @param password [String] Plain text password
    # @return [String] JWT token if authentication successful
    # @raise [InvalidCredentialsError] If credentials are invalid
    def authenticate(email, password)
      user = User.find_by(email: email)
      raise InvalidCredentialsError, 'Invalid email or password' unless user&.authenticate(password)

      raise InvalidCredentialsError, 'Account is not active' unless user.active?

      user.update!(last_login: Time.current)

      JwtTokenProvider.generate_token(user)
    end

    # Finds a user by ID.
    #
    # @param user_id [String] The user's UUID
    # @return [User] The user if found
    # @raise [UserNotFoundError] If user doesn't exist
    def find_by_id(user_id)
      User.find(user_id)
    rescue ActiveRecord::RecordNotFound
      raise UserNotFoundError, "User not found: #{user_id}"
    end

    # Updates a user's profile information.
    #
    # @param user_id [String] The user's UUID
    # @param full_name [String, nil] New full name (optional)
    # @param bio [String, nil] New bio (optional)
    # @param avatar_url [String, nil] New avatar URL (optional)
    # @return [User] The updated user
    def update_profile(user_id, full_name: nil, bio: nil, avatar_url: nil)
      user = find_by_id(user_id)
      user.update!(
        full_name: full_name,
        bio: bio,
        avatar_url: avatar_url,
        updated_at: Time.current
      )
      user
    end

    # Changes a user's password.
    #
    # @param user_id [String] The user's UUID
    # @param current_password [String] Current password
    # @param new_password [String] New password
    # @return [Boolean] True if password was changed
    # @raise [InvalidCredentialsError] If current password is incorrect
    def change_password(user_id, current_password, new_password)
      user = find_by_id(user_id)
      raise InvalidCredentialsError, 'Current password is incorrect' unless user.authenticate(current_password)

      user.update!(
        password_hash: PasswordEncoder.hash(new_password),
        updated_at: Time.current
      )

      # Invalidate all existing sessions
      JwtTokenProvider.invalidate_all_user_tokens(user_id)

      true
    end

    # Lists users with pagination and optional filters.
    #
    # @param page [Integer] Page number (0-based)
    # @param size [Integer] Page size
    # @param role [Symbol, nil] Filter by role (optional)
    # @param status [Symbol, nil] Filter by status (optional)
    # @return [Array<User>] Paginated list of users
    def list_users(page: 0, size: 50, role: nil, status: nil)
      scope = User.all
      scope = scope.where(role: role) if role
      scope = scope.where(status: status) if status
      scope.order(created_at: :desc).offset(page * size).limit(size).to_a
    end
  end
end

# TODO: Add password reset with secure email tokens
# TODO: Add OAuth2 provider integration (Google, GitHub)
# FIXME: Handle concurrent session limits per user
# NOTE: Consider adding audit logging for security events