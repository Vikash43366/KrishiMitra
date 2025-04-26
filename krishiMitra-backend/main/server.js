const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const crypto = require('crypto');
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Maxshot@12',
    database: 'krishimitra'
});

// Connect to database
db.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        console.error('Error code:', err.code);
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
        return;
    }
    console.log('Connected to MySQL database');
});

// Verify table structure
const verifyTable = () => {
    const createUsersTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            role ENUM('farmer', 'advisor', 'admin') DEFAULT 'farmer',
            status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
            reset_token VARCHAR(255) DEFAULT NULL,
            reset_token_expires DATETIME DEFAULT NULL,
            profile_image VARCHAR(255) DEFAULT NULL,
            phone VARCHAR(20) DEFAULT NULL,
            address TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `;
    
    const createExpensesTableQuery = `
        CREATE TABLE IF NOT EXISTS expenses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            category VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `;
    
    // Create users table first
    db.query(createUsersTableQuery, (err) => {
        if (err) {
            console.error('Error creating/verifying users table:', err);
            console.error('Error code:', err.code);
            console.error('Error message:', err.message);
        } else {
            console.log('Users table verified/created successfully');
            
            // Create expenses table after users table
            db.query(createExpensesTableQuery, (err) => {
                if (err) {
                    console.error('Error creating/verifying expenses table:', err);
                    console.error('Error code:', err.code);
                    console.error('Error message:', err.message);
                } else {
                    console.log('Expenses table verified/created successfully');
                }
            });
        }
    });
};

// Call verifyTable on startup
verifyTable();

// Login route
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login attempt for username:', username);
    
    const query = 'SELECT * FROM users WHERE username = ?';
    db.query(query, [username], async (err, results) => {
        if (err) {
            console.error('Login database error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            console.log('Login failed: User not found');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = results[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            console.log('Login failed: Invalid password');
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        console.log('Login successful for user:', username);
        res.json({ 
            message: 'Login successful', 
            user: { 
                id: user.id, 
                username: user.username,
                email: user.email,
                role: user.role,
                profile_image: user.profile_image,
                phone: user.phone,
                address: user.address
            } 
        });
    });
});

// Signup route
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body;
    console.log('Signup attempt for username:', username, 'email:', email);
    
    if (!username || !email || !password) {
        console.log('Signup failed: Missing required fields');
        return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const checkQuery = 'SELECT * FROM users WHERE username = ? OR email = ?';
    db.query(checkQuery, [username, email], async (err, results) => {
        if (err) {
            console.error('Signup database error (check):', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length > 0) {
            console.log('Signup failed: User already exists');
            return res.status(400).json({ error: 'Username or email already exists' });
        }
        
        try {
            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Insert new user
            const insertQuery = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
            db.query(insertQuery, [username, email, hashedPassword], (err, result) => {
                if (err) {
                    console.error('Signup database error (insert):', err);
                    return res.status(500).json({ error: 'Database error' });
                }
                
                console.log('Signup successful for user:', username);
                res.status(201).json({ message: 'User created successfully', userId: result.insertId });
            });
        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({ error: 'Error creating user' });
        }
    });
});

// Test database connection route
app.get('/api/test-db', (req, res) => {
    console.log('Testing database connection...');
    db.query('SELECT 1', (err, results) => {
        if (err) {
            console.error('Database test error:', err);
            console.error('Error code:', err.code);
            console.error('Error message:', err.message);
            return res.status(500).json({ 
                error: 'Database connection failed', 
                details: err.message,
                code: err.code
            });
        }
        console.log('Database test successful');
        res.json({ message: 'Database connection successful', results });
    });
});

// Get user profile
app.get('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const query = 'SELECT id, username, email, role, status, profile_image, phone, address, created_at FROM users WHERE id = ?';
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching user profile:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ user: results[0] });
    });
});

// Update user profile
app.put('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    const { username, email, phone, address, profile_image } = req.body;
    
    const updateQuery = `
        UPDATE users 
        SET username = ?, email = ?, phone = ?, address = ?, profile_image = ?
        WHERE id = ?
    `;
    
    db.query(updateQuery, [username, email, phone, address, profile_image, userId], (err, result) => {
        if (err) {
            console.error('Error updating user profile:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ message: 'Profile updated successfully' });
    });
});

// Request password reset
app.post('/api/users/reset-password-request', async (req, res) => {
    const { email } = req.body;
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour from now
    
    const updateQuery = `
        UPDATE users 
        SET reset_token = ?, reset_token_expires = ?
        WHERE email = ?
    `;
    
    db.query(updateQuery, [resetToken, resetTokenExpires, email], (err, result) => {
        if (err) {
            console.error('Error setting reset token:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Email not found' });
        }
        
        // TODO: Send email with reset token
        res.json({ message: 'Password reset email sent' });
    });
});

// Reset password with token
app.post('/api/users/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const updateQuery = `
            UPDATE users 
            SET password = ?, reset_token = NULL, reset_token_expires = NULL
            WHERE reset_token = ? AND reset_token_expires > NOW()
        `;
        
        db.query(updateQuery, [hashedPassword, token], (err, result) => {
            if (err) {
                console.error('Error resetting password:', err);
                return res.status(500).json({ error: 'Database error' });
            }
            
            if (result.affectedRows === 0) {
                return res.status(400).json({ error: 'Invalid or expired token' });
            }
            
            res.json({ message: 'Password reset successful' });
        });
    } catch (error) {
        console.error('Error hashing password:', error);
        res.status(500).json({ error: 'Error resetting password' });
    }
});

// Change password
app.post('/api/users/:id/change-password', async (req, res) => {
    const userId = req.params.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    // First verify current password
    const verifyQuery = 'SELECT password FROM users WHERE id = ?';
    db.query(verifyQuery, [userId], async (err, results) => {
        if (err) {
            console.error('Error verifying current password:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const validPassword = await bcrypt.compare(currentPassword, results[0].password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash and update new password
        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            const updateQuery = 'UPDATE users SET password = ? WHERE id = ?';
            
            db.query(updateQuery, [hashedPassword, userId], (err, result) => {
                if (err) {
                    console.error('Error updating password:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (result.affectedRows === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }

                res.json({ message: 'Password updated successfully' });
            });
        } catch (error) {
            console.error('Error hashing new password:', error);
            res.status(500).json({ error: 'Error updating password' });
        }
    });
});

// Add expense
app.post('/api/expenses', (req, res) => {
    const { user_id, category, description, amount, date } = req.body;
    
    console.log('Received expense data:', { user_id, category, description, amount, date });
    
    if (!user_id || !category || !description || !amount || !date) {
        console.log('Missing required fields:', { user_id, category, description, amount, date });
        return res.status(400).json({ error: 'All fields are required' });
    }

    const query = 'INSERT INTO expenses (user_id, category, description, amount, date) VALUES (?, ?, ?, ?, ?)';
    console.log('Executing query:', query);
    console.log('With values:', [user_id, category, description, amount, date]);
    
    db.query(query, [user_id, category, description, amount, date], (err, result) => {
        if (err) {
            console.error('Error adding expense:', err);
            console.error('Error code:', err.code);
            console.error('Error message:', err.message);
            return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        console.log('Expense added successfully:', result);
        res.status(201).json({ message: 'Expense added successfully', id: result.insertId });
    });
});

// Get all expenses for a user
app.get('/api/expenses/:user_id', (req, res) => {
    const userId = req.params.user_id;
    const query = 'SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC';
    
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error fetching expenses:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ expenses: results });
    });
});

// Update expense
app.put('/api/expenses/:id', (req, res) => {
    const expenseId = req.params.id;
    const { category, description, amount, date } = req.body;
    
    const query = 'UPDATE expenses SET category = ?, description = ?, amount = ?, date = ? WHERE id = ?';
    db.query(query, [category, description, amount, date, expenseId], (err, result) => {
        if (err) {
            console.error('Error updating expense:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json({ message: 'Expense updated successfully' });
    });
});

// Delete expense
app.delete('/api/expenses/:id', (req, res) => {
    const expenseId = req.params.id;
    const query = 'DELETE FROM expenses WHERE id = ?';
    
    db.query(query, [expenseId], (err, result) => {
        if (err) {
            console.error('Error deleting expense:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Expense not found' });
        }
        res.json({ message: 'Expense deleted successfully' });
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message
    });
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Test database connection at: http://localhost:${port}/api/test-db`);
}); 