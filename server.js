const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const sqlite3 = require('sqlite3').verbose();
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup
const db = new sqlite3.Database('./users.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

// Create users table
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    company TEXT NOT NULL,
    address_street TEXT NOT NULL,
    address_city TEXT NOT NULL,
    address_zip TEXT NOT NULL,
    geo_lat REAL NOT NULL,
    geo_lng REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Validation middleware
const validateUser = [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('phone').trim().isLength({ min: 1 }).withMessage('Phone is required'),
  body('company').trim().isLength({ min: 1 }).withMessage('Company is required'),
  body('address.street').trim().isLength({ min: 1 }).withMessage('Street address is required'),
  body('address.city').trim().isLength({ min: 1 }).withMessage('City is required'),
  body('address.zip').trim().isLength({ min: 1 }).withMessage('Zip code is required'),
  body('address.geo.lat').isFloat().withMessage('Valid latitude is required'),
  body('address.geo.lng').isFloat().withMessage('Valid longitude is required')
];

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Routes

// GET /api/users - Get all users
app.get('/api/users', (req, res) => {
  const sql = `SELECT 
    id, name, email, phone, company,
    address_street as "address.street",
    address_city as "address.city", 
    address_zip as "address.zip",
    geo_lat as "address.geo.lat",
    geo_lng as "address.geo.lng",
    created_at, updated_at
    FROM users ORDER BY created_at DESC`;
  
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('Error fetching users:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users',
        error: err.message
      });
    }
    
    // Transform the data to match the expected structure
    const users = rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      address: {
        street: row['address.street'],
        city: row['address.city'],
        zip: row['address.zip'],
        geo: {
          lat: row['address.geo.lat'],
          lng: row['address.geo.lng']
        }
      },
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    res.json({
      success: true,
      data: users
    });
  });
});

// GET /api/users/:id - Get single user
app.get('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const sql = `SELECT 
    id, name, email, phone, company,
    address_street as "address.street",
    address_city as "address.city", 
    address_zip as "address.zip",
    geo_lat as "address.geo.lat",
    geo_lng as "address.geo.lng",
    created_at, updated_at
    FROM users WHERE id = ?`;
  
  db.get(sql, [id], (err, row) => {
    if (err) {
      console.error('Error fetching user:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user',
        error: err.message
      });
    }
    
    if (!row) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      company: row.company,
      address: {
        street: row['address.street'],
        city: row['address.city'],
        zip: row['address.zip'],
        geo: {
          lat: row['address.geo.lat'],
          lng: row['address.geo.lng']
        }
      },
      created_at: row.created_at,
      updated_at: row.updated_at
    };
    
    res.json({
      success: true,
      data: user
    });
  });
});

// POST /api/users - Create new user
app.post('/api/users', validateUser, handleValidationErrors, (req, res) => {
  const { name, email, phone, company, address } = req.body;
  
  const sql = `INSERT INTO users 
    (name, email, phone, company, address_street, address_city, address_zip, geo_lat, geo_lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const params = [
    name, email, phone, company,
    address.street, address.city, address.zip,
    address.geo.lat, address.geo.lng
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('Error creating user:', err.message);
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to create user',
        error: err.message
      });
    }
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { id: this.lastID }
    });
  });
});

// PUT /api/users/:id - Update user
app.put('/api/users/:id', validateUser, handleValidationErrors, (req, res) => {
  const { id } = req.params;
  const { name, email, phone, company, address } = req.body;
  
  const sql = `UPDATE users SET 
    name = ?, email = ?, phone = ?, company = ?,
    address_street = ?, address_city = ?, address_zip = ?,
    geo_lat = ?, geo_lng = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`;
  
  const params = [
    name, email, phone, company,
    address.street, address.city, address.zip,
    address.geo.lat, address.geo.lng, id
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('Error updating user:', err.message);
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
      return res.status(500).json({
        success: false,
        message: 'Failed to update user',
        error: err.message
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User updated successfully'
    });
  });
});

// DELETE /api/users/:id - Delete user
app.delete('/api/users/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM users WHERE id = ?';
  
  db.run(sql, [id], function(err) {
    if (err) {
      console.error('Error deleting user:', err.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete user',
        error: err.message
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
    process.exit(0);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
