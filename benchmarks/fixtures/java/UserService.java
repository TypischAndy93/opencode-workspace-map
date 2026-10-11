/**
 * User service for managing user accounts and profiles.
 * Provides CRUD operations, authentication, and session management.
 */
package com.example.service;

import com.example.model.User;
import com.example.model.UserRole;
import com.example.model.UserStatus;
import com.example.repository.UserRepository;
import com.example.security.PasswordEncoder;
import com.example.security.JwtTokenProvider;
import com.example.exception.UserNotFoundException;
import com.example.exception.InvalidCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Service layer for user management operations.
 * Handles business logic for user registration, authentication, and profile management.
 */
@Service
@Transactional
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    public UserService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    /**
     * Registers a new user account.
     *
     * @param email     user's email address
     * @param username  desired username
     * @param password  plain text password
     * @param fullName  optional full name
     * @return the created user
     * @throws IllegalArgumentException if email or username already exists
     */
    public User register(String email, String username, String password, String fullName) {
        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email already registered: " + email);
        }
        if (userRepository.existsByUsername(username)) {
            throw new IllegalArgumentException("Username already taken: " + username);
        }

        String passwordHash = passwordEncoder.encode(password);
        
        User user = User.builder()
            .id(UUID.randomUUID())
            .email(email)
            .username(username)
            .passwordHash(passwordHash)
            .fullName(fullName)
            .role(UserRole.USER)
            .status(UserStatus.PENDING_VERIFICATION)
            .createdAt(Instant.now())
            .updatedAt(Instant.now())
            .build();

        return userRepository.save(user);
    }

    /**
     * Authenticates a user with email and password.
     *
     * @param email    user's email
     * @param password plain text password
     * @return JWT token if authentication successful
     * @throws InvalidCredentialsException if credentials are invalid
     */
    public String authenticate(String email, String password) {
        User user = userRepository.findByEmail(email)
            .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new InvalidCredentialsException("Invalid email or password");
        }

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new InvalidCredentialsException("Account is not active");
        }

        user.setLastLogin(Instant.now());
        userRepository.save(user);

        return jwtTokenProvider.generateToken(user);
    }

    /**
     * Finds a user by ID.
     *
     * @param userId the user's UUID
     * @return the user if found
     * @throws UserNotFoundException if user doesn't exist
     */
    @Transactional(readOnly = true)
    public User findById(UUID userId) {
        return userRepository.findById(userId)
            .orElseThrow(() -> new UserNotFoundException("User not found: " + userId));
    }

    /**
     * Updates a user's profile information.
     *
     * @param userId     the user's UUID
     * @param fullName   new full name (optional)
     * @param bio        new bio (optional)
     * @param avatarUrl  new avatar URL (optional)
     * @return the updated user
     */
    public User updateProfile(UUID userId, String fullName, String bio, String avatarUrl) {
        User user = findById(userId);
        
        if (fullName != null) user.setFullName(fullName);
        if (bio != null) user.setBio(bio);
        if (avatarUrl != null) user.setAvatarUrl(avatarUrl);
        
        user.setUpdatedAt(Instant.now());
        return userRepository.save(user);
    }

    /**
     * Changes a user's password.
     *
     * @param userId          the user's UUID
     * @param currentPassword current password
     * @param newPassword     new password
     * @return true if password was changed
     * @throws InvalidCredentialsException if current password is incorrect
     */
    public boolean changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = findById(userId);
        
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new InvalidCredentialsException("Current password is incorrect");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdatedAt(Instant.now());
        
        // Invalidate all existing sessions
        jwtTokenProvider.invalidateAllUserTokens(userId);
        
        userRepository.save(user);
        return true;
    }

    /**
     * Lists users with pagination and optional filters.
     *
     * @param page     page number (0-based)
     * @param size     page size
     * @param role     filter by role (optional)
     * @param status   filter by status (optional)
     * @return paginated list of users
     */
    @Transactional(readOnly = true)
    public List<User> listUsers(int page, int size, UserRole role, UserStatus status) {
        return userRepository.findAll(role, status, page, size);
    }

    // TODO: Add password reset with secure email tokens
    // TODO: Add OAuth2 provider integration (Google, GitHub)
    // FIXME: Handle concurrent session limits per user
    // NOTE: Consider adding audit logging for security events
}