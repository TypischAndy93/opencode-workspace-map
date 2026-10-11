/// User service for managing user accounts and profiles.
/// Provides CRUD operations, authentication, and session management.
library user_service;

import 'dart:async';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:uuid/uuid.dart';

/// User service for managing user accounts and profiles.
/// Provides CRUD operations, authentication, and session management.
class UserService {
  /// User repository for data access
  final UserRepository _userRepository;

  /// Password encoder for hashing/verification
  final PasswordEncoder _passwordEncoder;

  /// JWT token provider for authentication
  final JwtTokenProvider _jwtProvider;

  /// Logger for audit trail
  final Logger _logger;

  /// Creates a new [UserService] with the given dependencies.
  UserService({
    required UserRepository userRepository,
    required PasswordEncoder passwordEncoder,
    required JwtTokenProvider jwtProvider,
    required Logger logger,
  })  : _userRepository = userRepository,
        _passwordEncoder = passwordEncoder,
        _jwtProvider = jwtProvider,
        _logger = logger;

  /// Registers a new user account.
  ///
  /// [email] - User's email address
  /// [username] - Desired username
  /// [password] - Plain text password
  /// [fullName] - Optional full name
  /// Returns the created [User]
  /// Throws [UserServiceException] if email or username already exists
  Future<User> register({
    required String email,
    required String username,
    required String password,
    String? fullName,
  }) async {
    if (await _userRepository.existsByEmail(email)) {
      throw UserServiceException.emailAlreadyRegistered(email);
    }
    if (await _userRepository.existsByUsername(username)) {
      throw UserServiceException.usernameAlreadyTaken(username);
    }

    final passwordHash = _passwordEncoder.hash(password);

    final user = User(
      id: const Uuid().v4(),
      email: email,
      username: username,
      passwordHash: passwordHash,
      fullName: fullName,
      role: UserRole.user,
      status: UserStatus.pendingVerification,
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    await _userRepository.save(user);
    _logger.info('User registered: ${user.id}');
    return user;
  }

  /// Authenticates a user with email and password.
  ///
  /// [email] - User's email
  /// [password] - Plain text password
  /// Returns JWT token if authentication successful
  /// Throws [UserServiceException] if credentials are invalid
  Future<String> authenticate({
    required String email,
    required String password,
  }) async {
    final user = await _userRepository.findByEmail(email);
    if (user == null || !_passwordEncoder.verify(password, user.passwordHash)) {
      _logger.warning('Failed authentication attempt for email: $email');
      throw UserServiceException.invalidCredentials();
    }

    if (user.status != UserStatus.active) {
      throw UserServiceException.accountNotActive();
    }

    user.lastLogin = DateTime.now();
    await _userRepository.save(user);

    return _jwtProvider.generateToken(user);
  }

  /// Finds a user by ID.
  ///
  /// [userId] - The user's UUID
  /// Returns the [User] if found
  /// Throws [UserServiceException] if user doesn't exist
  Future<User> findById(String userId) async {
    final user = await _userRepository.findById(userId);
    if (user == null) {
      throw UserServiceException.userNotFound(userId);
    }
    return user;
  }

  /// Updates a user's profile information.
  ///
  /// [userId] - The user's UUID
  /// [fullName] - New full name (optional)
  /// [bio] - New bio (optional)
  /// [avatarUrl] - New avatar URL (optional)
  /// Returns the updated [User]
  Future<User> updateProfile({
    required String userId,
    String? fullName,
    String? bio,
    String? avatarUrl,
  }) async {
    final user = await findById(userId);

    if (fullName != null) user.fullName = fullName;
    if (bio != null) user.bio = bio;
    if (avatarUrl != null) user.avatarUrl = avatarUrl;

    user.updatedAt = DateTime.now();
    await _userRepository.save(user);
    return user;
  }

  /// Changes a user's password.
  ///
  /// [userId] - The user's UUID
  /// [currentPassword] - Current password
  /// [newPassword] - New password
  /// Returns true if password was changed
  /// Throws [UserServiceException] if current password is incorrect
  Future<bool> changePassword({
    required String userId,
    required String currentPassword,
    required String newPassword,
  }) async {
    final user = await findById(userId);

    if (!_passwordEncoder.verify(currentPassword, user.passwordHash)) {
      throw UserServiceException.currentPasswordIncorrect();
    }

    user.passwordHash = _passwordEncoder.hash(newPassword);
    user.updatedAt = DateTime.now();

    // Invalidate all existing sessions
    await _jwtProvider.invalidateAllTokens(userId);

    await _userRepository.save(user);
    return true;
  }

  /// Lists users with pagination and optional filters.
  ///
  /// [page] - Page number (0-based)
  /// [size] - Page size
  /// [role] - Filter by role (optional)
  /// [status] - Filter by status (optional)
  /// Returns paginated list of users
  Future<List<User>> listUsers({
    int page = 0,
    int size = 50,
    UserRole? role,
    UserStatus? status,
  }) async {
    return _userRepository.list(
      page: page,
      size: size,
      role: role,
      status: status,
    );
  }
}

/// User role enumeration
enum UserRole { admin, user, moderator, guest }

/// User account status
enum UserStatus { active, inactive, suspended, pendingVerification }

/// User model
class User {
  final String id;
  final String email;
  final String username;
  String passwordHash;
  String? fullName;
  String? bio;
  String? avatarUrl;
  final UserRole role;
  UserStatus status;
  bool isVerified = false;
  DateTime? lastLogin;
  final DateTime createdAt;
  DateTime updatedAt;

  User({
    required this.id,
    required this.email,
    required this.username,
    required this.passwordHash,
    this.fullName,
    this.bio,
    this.avatarUrl,
    required this.role,
    required this.status,
    this.isVerified = false,
    this.lastLogin,
    required this.createdAt,
    required this.updatedAt,
  });
}

/// User service exceptions
class UserServiceException implements Exception {
  final String code;
  final String message;

  const UserServiceException._(this.code, this.message);

  factory UserServiceException.emailAlreadyRegistered(String email) =>
      UserServiceException._('EMAIL_EXISTS', 'Email already registered: $email');

  factory UserServiceException.usernameAlreadyTaken(String username) =>
      UserServiceException._('USERNAME_EXISTS', 'Username already taken: $username');

  factory UserServiceException.invalidCredentials() =>
      const UserServiceException._('INVALID_CREDENTIALS', 'Invalid email or password');

  factory UserServiceException.accountNotActive() =>
      const UserServiceException._('ACCOUNT_INACTIVE', 'Account is not active');

  factory UserServiceException.userNotFound(String userId) =>
      UserServiceException._('USER_NOT_FOUND', 'User not found: $userId');

  factory UserServiceException.currentPasswordIncorrect() =>
      const UserServiceException._('PASSWORD_INCORRECT', 'Current password is incorrect');
}

/// Abstract repository for user data access
abstract class UserRepository {
  Future<bool> existsByEmail(String email);
  Future<bool> existsByUsername(String username);
  Future<User?> findByEmail(String email);
  Future<User?> findById(String id);
  Future<void> save(User user);
  Future<List<User>> list({
    int page = 0,
    int size = 50,
    UserRole? role,
    UserStatus? status,
  });
}

/// Abstract password encoder
abstract class PasswordEncoder {
  String hash(String password);
  bool verify(String password, String hash);
}

/// Abstract JWT token provider
abstract class JwtTokenProvider {
  String generateToken(User user);
  Future<void> invalidateAllTokens(String userId);
}

/// Simple logger interface
abstract class Logger {
  void info(String message);
  void warning(String message);
  void error(String message);
}

/// Console logger implementation
class ConsoleLogger implements Logger {
  @override
  void info(String message) => print('[INFO] $message');

  @override
  void warning(String message) => print('[WARN] $message');

  @override
  void error(String message) => print('[ERROR] $message');
}

// TODO: Add password reset with secure email tokens
// TODO: Add OAuth2 provider integration (Google, Apple, GitHub)
// FIXME: Handle concurrent session limits per user
// NOTE: Consider adding audit logging for security events