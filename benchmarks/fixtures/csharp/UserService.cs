using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using BCrypt.Net;

namespace Example.Services
{
    /// <summary>
    /// User service for managing user accounts and profiles.
    /// Provides CRUD operations, authentication, and session management.
    /// </summary>
    public class UserService : IUserService
    {
        private readonly AppDbContext _context;
        private readonly IPasswordHasher _passwordHasher;
        private readonly IJwtTokenProvider _jwtProvider;
        private readonly ILogger<UserService> _logger;

        public UserService(
            AppDbContext context,
            IPasswordHasher passwordHasher,
            IJwtTokenProvider jwtProvider,
            ILogger<UserService> logger)
        {
            _context = context;
            _passwordHasher = passwordHasher;
            _jwtProvider = jwtProvider;
            _logger = logger;
        }

        /// <summary>
        /// Registers a new user account asynchronously.
        /// </summary>
        /// <param name="email">User's email address</param>
        /// <param name="username">Desired username</param>
        /// <param name="password">Plain text password</param>
        /// <param name="fullName">Optional full name</param>
        /// <returns>The created user</returns>
        /// <exception cref="ArgumentException">If email or username already exists</exception>
        public async Task<User> RegisterAsync(string email, string username, string password, string fullName = null)
        {
            if (await _context.Users.AnyAsync(u => u.Email == email))
                throw new ArgumentException($"Email already registered: {email}");

            if (await _context.Users.AnyAsync(u => u.Username == username))
                throw new ArgumentException($"Username already taken: {username}");

            var passwordHash = _passwordHasher.HashPassword(password);

            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = email,
                Username = username,
                PasswordHash = passwordHash,
                FullName = fullName,
                Role = UserRole.User,
                Status = UserStatus.PendingVerification,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Users.Add(user);
            await _context.SaveChangesAsync();

            _logger.LogInformation("User registered: {UserId}", user.Id);
            return user;
        }

        /// <summary>
        /// Authenticates a user and returns a JWT token.
        /// </summary>
        /// <param name="email">User's email</param>
        /// <param name="password">Plain text password</param>
        /// <returns>JWT token if authentication successful</returns>
        /// <exception cref="UnauthorizedAccessException">If credentials are invalid</exception>
        public async Task<string> AuthenticateAsync(string email, string password)
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);
            if (user == null || !_passwordHasher.VerifyPassword(password, user.PasswordHash))
            {
                _logger.LogWarning("Failed authentication attempt for email: {Email}", email);
                throw new UnauthorizedAccessException("Invalid email or password");
            }

            if (user.Status != UserStatus.Active)
                throw new UnauthorizedAccessException("Account is not active");

            user.LastLogin = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return _jwtProvider.GenerateToken(user);
        }

        /// <summary>
        /// Finds a user by ID asynchronously.
        /// </summary>
        /// <param name="userId">The user's GUID</param>
        /// <returns>The user if found</returns>
        /// <exception cref="KeyNotFoundException">If user doesn't exist</exception>
        public async Task<User> GetByIdAsync(Guid userId)
        {
            return await _context.Users.FindAsync(userId)
                ?? throw new KeyNotFoundException($"User not found: {userId}");
        }

        /// <summary>
        /// Updates a user's profile information.
        /// </summary>
        /// <param name="userId">The user's GUID</param>
        /// <param name="fullName">New full name (optional)</param>
        /// <param name="bio">New bio (optional)</param>
        /// <param name="avatarUrl">New avatar URL (optional)</param>
        /// <returns>The updated user</returns>
        public async Task<User> UpdateProfileAsync(Guid userId, string fullName = null, string bio = null, string avatarUrl = null)
        {
            var user = await GetByIdAsync(userId);

            if (fullName != null) user.FullName = fullName;
            if (bio != null) user.Bio = bio;
            if (avatarUrl != null) user.AvatarUrl = avatarUrl;

            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return user;
        }

        /// <summary>
        /// Changes a user's password.
        /// </summary>
        /// <param name="userId">The user's GUID</param>
        /// <param name="currentPassword">Current password</param>
        /// <param name="newPassword">New password</param>
        /// <returns>True if password was changed</returns>
        public async Task<bool> ChangePasswordAsync(Guid userId, string currentPassword, string newPassword)
        {
            var user = await GetByIdAsync(userId);

            if (!_passwordHasher.VerifyPassword(currentPassword, user.PasswordHash))
                throw new UnauthorizedAccessException("Current password is incorrect");

            user.PasswordHash = _passwordHasher.HashPassword(newPassword);
            user.UpdatedAt = DateTime.UtcNow;

            // Invalidate all existing sessions
            _jwtProvider.InvalidateAllUserTokens(userId);

            await _context.SaveChangesAsync();
            return true;
        }

        /// <summary>
        /// Lists users with pagination and optional filters.
        /// </summary>
        /// <param name="page">Page number (0-based)</param>
        /// <param name="size">Page size</param>
        /// <param name="role">Filter by role (optional)</param>
        /// <param name="status">Filter by status (optional)</param>
        /// <returns>Paginated list of users</returns>
        public async Task<IEnumerable<User>> ListUsersAsync(int page = 0, int size = 50, UserRole? role = null, UserStatus? status = null)
        {
            var query = _context.Users.AsQueryable();

            if (role.HasValue) query = query.Where(u => u.Role == role.Value);
            if (status.HasValue) query = query.Where(u => u.Status == status.Value);

            return await query
                .OrderByDescending(u => u.CreatedAt)
                .Skip(page * size)
                .Take(size)
                .ToListAsync();
        }

        // TODO: Add password reset with secure email tokens
        // TODO: Add OAuth2 provider integration (Google, GitHub, Microsoft)
        // FIXME: Handle concurrent session limits per user
        // NOTE: Consider adding audit logging for security events
    }

    /// <summary>
    /// User role enumeration.
    /// </summary>
    public enum UserRole
    {
        Admin,
        User,
        Moderator,
        Guest
    }

    /// <summary>
    /// User account status.
    /// </summary>
    public enum UserStatus
    {
        Active,
        Inactive,
        Suspended,
        PendingVerification
    }

    /// <summary>
    /// User entity.
    /// </summary>
    public class User
    {
        public Guid Id { get; set; }
        public string Email { get; set; }
        public string Username { get; set; }
        public string PasswordHash { get; set; }
        public string FullName { get; set; }
        public string Bio { get; set; }
        public string AvatarUrl { get; set; }
        public UserRole Role { get; set; }
        public UserStatus Status { get; set; }
        public bool IsVerified { get; set; }
        public DateTime? LastLogin { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
    }

    /// <summary>
    /// Database context for user management.
    /// </summary>
    public class AppDbContext : DbContext
    {
        public DbSet<User> Users { get; set; }

        public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Email).IsUnique();
                entity.HasIndex(e => e.Username).IsUnique();
            });
        }
    }

    /// <summary>
    /// Password hashing abstraction.
    /// </summary>
    public interface IPasswordHasher
    {
        string HashPassword(string password);
        bool VerifyPassword(string password, string hash);
    }

    /// <summary>
    /// BCrypt password hasher implementation.
    /// </summary>
    public class BCryptPasswordHasher : IPasswordHasher
    {
        public string HashPassword(string password) => BCrypt.HashPassword(password, workFactor: 12);
        public bool VerifyPassword(string password, string hash) => BCrypt.Verify(password, hash);
    }

    /// <summary>
    /// JWT token provider interface.
    /// </summary>
    public interface IJwtTokenProvider
    {
        string GenerateToken(User user);
        void InvalidateAllUserTokens(Guid userId);
    }
}