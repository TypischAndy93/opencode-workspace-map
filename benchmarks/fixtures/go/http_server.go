package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/bcrypt"
)

// User represents a system user
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Username  string    `json:"username"`
	FullName  string    `json:"full_name,omitempty"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Session represents an authenticated session
type Session struct {
	Token     string    `json:"token"`
	UserID    string    `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// In-memory stores (replace with database in production)
var (
	users    = make(map[string]*User)
	sessions = make(map[string]*Session)
	mu       sync.RWMutex
)

// Password hashing
func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func checkPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// Generate secure random token
func generateToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// Create user handler
func createUser(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Username string `json:"username"`
		Password string `json:"password"`
		FullName string `json:"full_name,omitempty"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	// Validate input
	if req.Email == "" || req.Username == "" || req.Password == "" {
		http.Error(w, "Email, username, and password are required", http.StatusBadRequest)
		return
	}
	
	if len(req.Password) < 8 {
		http.Error(w, "Password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	
	mu.Lock()
	defer mu.Unlock()
	
	// Check for existing user
	for _, u := range users {
		if u.Email == req.Email || u.Username == req.Username {
			http.Error(w, "Email or username already exists", http.StatusConflict)
			return
		}
	}
	
	passwordHash, err := hashPassword(req.Password)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}
	
	user := &User{
		ID:        uuid.New().String(),
		Email:     req.Email,
		Username:  req.Username,
		FullName:  req.FullName,
		Role:      "user",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	
	// Store password hash separately (not in user object)
	userKey := "password:" + user.ID
	users[userKey] = &User{PasswordHash: passwordHash} // Store password separately
	
	users[user.ID] = user
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// Login handler
func login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	mu.RLock()
	var user *User
	for _, u := range users {
		if u.Email == req.Email {
			user = u
			break
		}
	}
	mu.RUnlock()
	
	if user == nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	
	// Check password
	mu.RLock()
	passwordHash := users["password:"+user.ID].PasswordHash
	mu.RUnlock()
	
	if !checkPasswordHash(req.Password, passwordHash) {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}
	
	token, err := generateToken()
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}
	
	expiresAt := time.Now().Add(24 * time.Hour)
	session := &Session{
		Token:     token,
		UserID:    user.ID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	
	mu.Lock()
	sessions[token] = session
	mu.Unlock()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": token})
}

// Auth middleware
func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Authorization header required", http.StatusUnauthorized)
			return
		}
		
		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == authHeader {
			http.Error(w, "Bearer token required", http.StatusUnauthorized)
			return
		}
		
		mu.RLock()
		session, exists := sessions[token]
		mu.RUnlock()
		
		if !exists || time.Now().After(session.ExpiresAt) {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}
		
		// Add user to context
		ctx := context.WithValue(r.Context(), "userID", session.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Get current user
func getCurrentUser(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value("userID").(string)
	
	mu.RLock()
	user, exists := users[userID]
	mu.RUnlock()
	
	if !exists {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WebSocket handler for real-time updates
func websocketHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}
	defer conn.Close()
	
	// Send periodic updates
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			mu.RLock()
			userCount := len(users) - len(sessions) // approximate
			mu.RUnlock()
			
			msg := map[string]interface{}{
				"type":        "stats",
				"user_count":  userCount,
				"timestamp":   time.Now().Unix(),
			}
			
			if err := conn.WriteJSON(msg); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}
		}
	}
}

// Health check
func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status":    "healthy",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}

func main() {
	router := mux.NewRouter()
	
	// Public routes
	router.HandleFunc("/health", healthCheck).Methods("GET")
	router.HandleFunc("/api/users", createUser).Methods("POST")
	router.HandleFunc("/api/auth/login", login).Methods("POST")
	
	// Protected routes
	protected := router.PathPrefix("/api").Subrouter()
	protected.Use(authMiddleware)
	protected.HandleFunc("/user", getCurrentUser).Methods("GET")
	protected.HandleFunc("/ws", websocketHandler).Methods("GET")
	
	// Static files
	router.PathPrefix("/").Handler(http.FileServer(http.Dir("./static")))
	
	server := &http.Server{
		Addr:         ":8080",
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	
	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt)
		<-sigChan
		
		log.Println("Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		server.Shutdown(ctx)
	}()
	
	log.Println("Server starting on :8080")
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed: %v", err)
	}
	log.Println("Server stopped")
}

// TODO: Add rate limiting middleware
// TODO: Add request logging middleware
// TODO: Implement refresh token rotation
// FIXME: Fix potential memory leak in WebSocket connections