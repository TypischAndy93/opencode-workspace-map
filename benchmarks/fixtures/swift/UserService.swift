import Foundation
import CryptoKit

/// User service for managing user accounts and profiles.
/// Provides CRUD operations, authentication, and session management.
class UserService {

    // MARK: - Dependencies
    private let userRepository: UserRepository
    private let passwordEncoder: PasswordEncoder
    private let jwtProvider: JwtTokenProvider
    private let logger: Logger

    // MARK: - Initialization
    init(
        userRepository: UserRepository,
        passwordEncoder: PasswordEncoder,
        jwtProvider: JwtTokenProvider,
        logger: Logger = Logger.shared
    ) {
        self.userRepository = userRepository
        self.passwordEncoder = passwordEncoder
        self.jwtProvider = jwtProvider
        self.logger = logger
    }

    // MARK: - Public Methods

    /// Registers a new user account.
    ///
    /// - Parameters:
    ///   - email: User's email address
    ///   - username: Desired username
    ///   - password: Plain text password
    ///   - fullName: Optional full name
    /// - Returns: The created user
    /// - Throws: UserServiceError if email or username already exists
    func register(
        email: String,
        username: String,
        password: String,
        fullName: String? = nil
    ) async throws -> User {
        guard !(try await userRepository.exists(email: email)) else {
            throw UserServiceError.emailAlreadyRegistered(email)
        }
        guard !(try await userRepository.exists(username: username)) else {
            throw UserServiceError.usernameAlreadyTaken(username)
        }

        let passwordHash = try passwordEncoder.hash(password)

        let user = User(
            id: UUID(),
            email: email,
            username: username,
            passwordHash: passwordHash,
            fullName: fullName,
            role: .user,
            status: .pendingVerification,
            createdAt: Date(),
            updatedAt: Date()
        )

        try await userRepository.save(user)
        logger.info("User registered: \(user.id)")
        return user
    }

    /// Authenticates a user with email and password.
    ///
    /// - Parameters:
    ///   - email: User's email
    ///   - password: Plain text password
    /// - Returns: JWT token if authentication successful
    /// - Throws: UserServiceError if credentials are invalid
    func authenticate(email: String, password: String) async throws -> String {
        guard let user = try await userRepository.findByEmail(email) else {
            logger.warning("Failed authentication attempt for email: \(email)")
            throw UserServiceError.invalidCredentials
        }

        guard try passwordEncoder.verify(password, hash: user.passwordHash) else {
            logger.warning("Failed authentication attempt for email: \(email)")
            throw UserServiceError.invalidCredentials
        }

        guard user.status == .active else {
            throw UserServiceError.accountNotActive
        }

        user.lastLogin = Date()
        try await userRepository.save(user)

        return try jwtProvider.generateToken(for: user)
    }

    /// Finds a user by ID.
    ///
    /// - Parameter userId: The user's UUID
    /// - Returns: The user if found
    /// - Throws: UserServiceError if user doesn't exist
    func findById(_ userId: UUID) async throws -> User {
        guard let user = try await userRepository.findById(userId) else {
            throw UserServiceError.userNotFound(userId)
        }
        return user
    }

    /// Updates a user's profile information.
    ///
    /// - Parameters:
    ///   - userId: The user's UUID
    ///   - fullName: New full name (optional)
    ///   - bio: New bio (optional)
    ///   - avatarUrl: New avatar URL (optional)
    /// - Returns: The updated user
    func updateProfile(
        _ userId: UUID,
        fullName: String? = nil,
        bio: String? = nil,
        avatarUrl: String? = nil
    ) async throws -> User {
        var user = try await findById(userId)

        if let fullName = fullName { user.fullName = fullName }
        if let bio = bio { user.bio = bio }
        if let avatarUrl = avatarUrl { user.avatarUrl = avatarUrl }

        user.updatedAt = Date()
        try await userRepository.save(user)
        return user
    }

    /// Changes a user's password.
    ///
    /// - Parameters:
    ///   - userId: The user's UUID
    ///   - currentPassword: Current password
    ///   - newPassword: New password
    /// - Returns: True if password was changed
    /// - Throws: UserServiceError if current password is incorrect
    func changePassword(_ userId: UUID, currentPassword: String, newPassword: String) async throws -> Bool {
        var user = try await findById(userId)

        guard try passwordEncoder.verify(currentPassword, hash: user.passwordHash) else {
            throw UserServiceError.invalidCredentials
        }

        user.passwordHash = try passwordEncoder.hash(newPassword)
        user.updatedAt = Date()

        // Invalidate all existing sessions
        try await jwtProvider.invalidateAllTokens(for: userId)

        try await userRepository.save(user)
        return true
    }

    /// Lists users with pagination and optional filters.
    ///
    /// - Parameters:
    ///   - page: Page number (0-based)
    ///   - size: Page size
    ///   - role: Filter by role (optional)
    ///   - status: Filter by status (optional)
    /// - Returns: Paginated list of users
    func listUsers(
        page: Int = 0,
        size: Int = 50,
        role: UserRole? = nil,
        status: UserStatus? = nil
    ) async throws -> [User] {
        return try await userRepository.list(
            page: page,
            size: size,
            role: role,
            status: status
        )
    }
}

// MARK: - Supporting Types

enum UserRole: String, Codable {
    case admin, user, moderator, guest
}

enum UserStatus: String, Codable {
    case active, inactive, suspended, pendingVerification
}

struct User: Codable {
    let id: UUID
    var email: String
    var username: String
    var passwordHash: String
    var fullName: String?
    var bio: String?
    var avatarUrl: String?
    var role: UserRole
    var status: UserStatus
    var isVerified: Bool = false
    var lastLogin: Date?
    let createdAt: Date
    var updatedAt: Date
}

enum UserServiceError: Error, LocalizedError {
    case emailAlreadyRegistered(String)
    case usernameAlreadyTaken(String)
    case invalidCredentials
    case accountNotActive
    case userNotFound(UUID)
    case currentPasswordIncorrect

    var errorDescription: String? {
        switch self {
        case .emailAlreadyRegistered(let email): return "Email already registered: \(email)"
        case .usernameAlreadyTaken(let username): return "Username already taken: \(username)"
        case .invalidCredentials: return "Invalid email or password"
        case .accountNotActive: return "Account is not active"
        case .userNotFound(let id): return "User not found: \(id)"
        case .currentPasswordIncorrect: return "Current password is incorrect"
        }
    }
}

// MARK: - Protocols

protocol UserRepository {
    func exists(email: String) async throws -> Bool
    func exists(username: String) async throws -> Bool
    func findByEmail(_ email: String) async throws -> User?
    func findById(_ id: UUID) async throws -> User?
    func save(_ user: User) async throws
    func list(page: Int, size: Int, role: UserRole?, status: UserStatus?) async throws -> [User]
}

protocol PasswordEncoder {
    func hash(_ password: String) throws -> String
    func verify(_ password: String, hash: String) throws -> Bool
}

protocol JwtTokenProvider {
    func generateToken(for user: User) throws -> String
    func invalidateAllTokens(for userId: UUID) async throws
}

class Logger {
    static let shared = Logger()
    private init() {}

    func info(_ message: String) { print("[INFO] \(message)") }
    func warning(_ message: String) { print("[WARN] \(message)") }
    func error(_ message: String) { print("[ERROR] \(message)") }
}

// TODO: Add password reset with secure email tokens
// TODO: Add OAuth2 provider integration (Apple, Google, GitHub)
// FIXME: Handle concurrent session limits per user
// NOTE: Consider adding audit logging for security events