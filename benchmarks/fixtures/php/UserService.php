<?php

/**
 * User service for managing user accounts and profiles.
 * Provides CRUD operations, authentication, and session management.
 */
declare(strict_types=1);

namespace App\Service;

use App\Entity\User;
use App\Entity\UserRole;
use App\Entity\UserStatus;
use App\Repository\UserRepository;
use App\Security\PasswordEncoder;
use App\Security\JwtTokenProvider;
use App\Exception\UserNotFoundException;
use App\Exception\InvalidCredentialsException;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;

class UserService
{
    private UserRepository $userRepository;
    private PasswordEncoder $passwordEncoder;
    private JwtTokenProvider $jwtTokenProvider;
    private LoggerInterface $logger;
    private EntityManagerInterface $entityManager;

    public function __construct(
        UserRepository $userRepository,
        PasswordEncoder $passwordEncoder,
        JwtTokenProvider $jwtTokenProvider,
        LoggerInterface $logger,
        EntityManagerInterface $entityManager
    ) {
        $this->userRepository = $userRepository;
        $this->passwordEncoder = $passwordEncoder;
        $this->jwtTokenProvider = $jwtTokenProvider;
        $this->logger = $logger;
        $this->entityManager = $entityManager;
    }

    /**
     * Registers a new user account.
     *
     * @param string $email     User's email address
     * @param string $username  Desired username
     * @param string $password  Plain text password
     * @param string|null $fullName  Optional full name
     * @return User The created user
     * @throws \InvalidArgumentException If email or username already exists
     */
    public function register(string $email, string $username, string $password, ?string $fullName = null): User
    {
        if ($this->userRepository->existsByEmail($email)) {
            throw new \InvalidArgumentException("Email already registered: $email");
        }
        if ($this->userRepository->existsByUsername($username)) {
            throw new \InvalidArgumentException("Username already taken: $username");
        }

        $passwordHash = $this->passwordEncoder->hashPassword($password);

        $user = new User();
        $user->setEmail($email);
        $user->setUsername($username);
        $user->setPasswordHash($passwordHash);
        $user->setFullName($fullName);
        $user->setRole(UserRole::USER);
        $user->setStatus(UserStatus::PENDING_VERIFICATION);
        $user->setCreatedAt(new \DateTimeImmutable());
        $user->setUpdatedAt(new \DateTimeImmutable());

        $this->entityManager->persist($user);
        $this->entityManager->flush();

        $this->logger->info('User registered', ['user_id' => $user->getId()]);
        return $user;
    }

    /**
     * Authenticates a user with email and password.
     *
     * @param string $email    User's email
     * @param string $password Plain text password
     * @return string JWT token if authentication successful
     * @throws InvalidCredentialsException If credentials are invalid
     */
    public function authenticate(string $email, string $password): string
    {
        $user = $this->userRepository->findByEmail($email);
        if (!$user || !$this->passwordEncoder->verifyPassword($password, $user->getPasswordHash())) {
            $this->logger->warning('Failed authentication attempt', ['email' => $email]);
            throw new InvalidCredentialsException('Invalid email or password');
        }

        if ($user->getStatus() !== UserStatus::ACTIVE) {
            throw new InvalidCredentialsException('Account is not active');
        }

        $user->setLastLogin(new \DateTimeImmutable());
        $this->entityManager->flush();

        return $this->jwtTokenProvider->generateToken($user);
    }

    /**
     * Finds a user by ID.
     *
     * @param string $userId The user's UUID
     * @return User The user if found
     * @throws UserNotFoundException If user doesn't exist
     */
    public function findById(string $userId): User
    {
        return $this->userRepository->find($userId)
            ?? throw new UserNotFoundException("User not found: $userId");
    }

    /**
     * Updates a user's profile information.
     *
     * @param string $userId   The user's UUID
     * @param string|null $fullName   New full name (optional)
     * @param string|null $bio        New bio (optional)
     * @param string|null $avatarUrl  New avatar URL (optional)
     * @return User The updated user
     */
    public function updateProfile(string $userId, ?string $fullName = null, ?string $bio = null, ?string $avatarUrl = null): User
    {
        $user = $this->findById($userId);

        if ($fullName !== null) $user->setFullName($fullName);
        if ($bio !== null) $user->setBio($bio);
        if ($avatarUrl !== null) $user->setAvatarUrl($avatarUrl);

        $user->setUpdatedAt(new \DateTimeImmutable());
        $this->entityManager->flush();

        return $user;
    }

    /**
     * Changes a user's password.
     *
     * @param string $userId         The user's UUID
     * @param string $currentPassword Current password
     * @param string $newPassword     New password
     * @return bool True if password was changed
     * @throws InvalidCredentialsException If current password is incorrect
     */
    public function changePassword(string $userId, string $currentPassword, string $newPassword): bool
    {
        $user = $this->findById($userId);

        if (!$this->passwordEncoder->verifyPassword($currentPassword, $user->getPasswordHash())) {
            throw new InvalidCredentialsException('Current password is incorrect');
        }

        $user->setPasswordHash($this->passwordEncoder->hashPassword($newPassword));
        $user->setUpdatedAt(new \DateTimeImmutable());

        // Invalidate all existing sessions
        $this->jwtTokenProvider->invalidateAllUserTokens($userId);

        $this->entityManager->flush();
        return true;
    }

    /**
     * Lists users with pagination and optional filters.
     *
     * @param int $page     Page number (0-based)
     * @param int $size     Page size
     * @param UserRole|null $role   Filter by role (optional)
     * @param UserStatus|null $status Filter by status (optional)
     * @return array Paginated list of users
     */
    public function listUsers(int $page = 0, int $size = 50, ?UserRole $role = null, ?UserStatus $status = null): array
    {
        return $this->userRepository->findAll($role, $status, $page, $size);
    }

    // TODO: Add password reset with secure email tokens
    // TODO: Add OAuth2 provider integration (Google, GitHub)
    // FIXME: Handle concurrent session limits per user
    // NOTE: Consider adding audit logging for security events
}