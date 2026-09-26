const db = require('../config/db');
const { hashPassword, comparePassword, generateToken } = require('../utils/auth');

async function register(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    return res.status(201).json({
      message: 'User registered successfully',
      user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const result = await db.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isMatch = await comparePassword(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    return res.json({
      message: 'Login successful',
      user: { id: user.id, name: user.name, email: user.email, created_at: user.created_at },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
}

async function getMe(req, res) {
  try {
    const userId = req.user.id;
    const result = await db.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ error: 'Internal server error fetching profile.' });
  }
}

module.exports = { register, login, getMe };

