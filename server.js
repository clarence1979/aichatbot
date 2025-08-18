const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database table
async function initializeDatabase() {
  try {
    const client = await pool.connect();
    
    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_interactions (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        session_id VARCHAR(255) NOT NULL,
        student_name VARCHAR(255),
        class_name VARCHAR(255),
        question_number INTEGER,
        interaction_type VARCHAR(50) NOT NULL,
        question TEXT,
        ai_response TEXT,
        category VARCHAR(50),
        risk_level VARCHAR(20),
        flags TEXT[],
        word_count INTEGER,
        analysis_details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    // Create index for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_session_id ON student_interactions(session_id);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON student_interactions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_student_name ON student_interactions(student_name);
    `);
    
    client.release();
    console.log('✅ Database initialized successfully');
    
  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Helper function to escape CSV values
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Routes
app.get('/status', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) as total FROM student_interactions');
    client.release();
    
    res.json({ 
      status: 'online', 
      message: 'Server running with database',
      timestamp: new Date().toISOString(),
      totalLogs: parseInt(result.rows[0].total),
      database: 'connected'
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Database connection failed',
      database: 'disconnected'
    });
  }
});

app.post('/log', async (req, res) => {
  try {
    const logEntry = req.body;
    
    // Validate required fields
    if (!logEntry.sessionId || !logEntry.timestamp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const client = await pool.connect();
    
    // Insert into database
    const query = `
      INSERT INTO student_interactions (
        timestamp, session_id, student_name, class_name, question_number,
        interaction_type, question, ai_response, category, risk_level,
        flags, word_count, analysis_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;
    
    const values = [
      logEntry.timestamp,
      logEntry.sessionId,
      logEntry.student?.name || 'Anonymous',
      logEntry.student?.class || 'Not specified',
      logEntry.questionNumber || null,
      logEntry.type,
      logEntry.question || '',
      logEntry.response || '',
      logEntry.category || '',
      logEntry.analysis?.riskLevel || '',
      logEntry.analysis?.flags || [],
      logEntry.analysis?.wordCount || null,
      JSON.stringify(logEntry.analysis || {})
    ];
    
    const result = await client.query(query, values);
    client.release();
    
    console.log(`📝 Logged to DB: ${logEntry.type} - ${logEntry.student?.name || 'Anonymous'} - ${logEntry.category || 'N/A'} (ID: ${result.rows[0].id})`);
    
    res.json({ 
      success: true, 
      message: 'Logged successfully',
      logId: result.rows[0].id
    });
    
  } catch (error) {
    console.error('❌ Error logging to database:', error);
    res.status(500).json({ error: 'Failed to log interaction' });
  }
});

app.get('/csv', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Get all interactions ordered by timestamp
    const result = await client.query(`
      SELECT * FROM student_interactions 
      ORDER BY timestamp ASC
    `);
    
    client.release();
    
    // Convert to CSV format
    const headers = [
      'Timestamp', 'Session_ID', 'Student_Name', 'Class', 'Question_Number',
      'Interaction_Type', 'Question', 'AI_Response_Preview', 'Category',
      'Risk_Level', 'Flags', 'Word_Count', 'Analysis_Details'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    result.rows.forEach(row => {
      const csvRow = [
        escapeCSV(row.timestamp),
        escapeCSV(row.session_id),
        escapeCSV(row.student_name),
        escapeCSV(row.class_name),
        escapeCSV(row.question_number),
        escapeCSV(row.interaction_type),
        escapeCSV(row.question),
        escapeCSV(row.ai_response ? row.ai_response.substring(0, 200) : ''),
        escapeCSV(row.category),
        escapeCSV(row.risk_level),
        escapeCSV(row.flags ? row.flags.join('; ') : ''),
        escapeCSV(row.word_count),
        escapeCSV(JSON.stringify(row.analysis_details || {}))
      ];
      csvContent += csvRow.join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(csvContent);
    
  } catch (error) {
    console.error('❌ Error generating CSV:', error);
    res.status(500).json({ error: 'Failed to generate CSV' });
  }
});

app.get('/csv/download', async (req, res) => {
  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT * FROM student_interactions 
      ORDER BY timestamp ASC
    `);
    
    client.release();
    
    // Convert to CSV format
    const headers = [
      'Timestamp', 'Session_ID', 'Student_Name', 'Class', 'Question_Number',
      'Interaction_Type', 'Question', 'AI_Response_Preview', 'Category',
      'Risk_Level', 'Flags', 'Word_Count', 'Analysis_Details'
    ];
    
    let csvContent = headers.join(',') + '\n';
    
    result.rows.forEach(row => {
      const csvRow = [
        escapeCSV(row.timestamp),
        escapeCSV(row.session_id),
        escapeCSV(row.student_name),
        escapeCSV(row.class_name),
        escapeCSV(row.question_number),
        escapeCSV(row.interaction_type),
        escapeCSV(row.question),
        escapeCSV(row.ai_response ? row.ai_response.substring(0, 500) : ''),
        escapeCSV(row.category),
        escapeCSV(row.risk_level),
        escapeCSV(row.flags ? row.flags.join('; ') : ''),
        escapeCSV(row.word_count),
        escapeCSV(JSON.stringify(row.analysis_details || {}))
      ];
      csvContent += csvRow.join(',') + '\n';
    });
    
    const filename = `student_interactions_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    res.send(csvContent);
    
  } catch (error) {
    console.error('❌ Error downloading CSV:', error);
    res.status(500).json({ error: 'Failed to download CSV file' });
  }
});

// Get statistics
app.get('/stats', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Get comprehensive statistics
    const totalResult = await client.query('SELECT COUNT(*) as total FROM student_interactions');
    const sessionResult = await client.query('SELECT COUNT(DISTINCT session_id) as sessions FROM student_interactions');
    const studentResult = await client.query('SELECT COUNT(DISTINCT student_name) as students FROM student_interactions WHERE student_name != \'Anonymous\'');
    const categoryResult = await client.query(`
      SELECT category, COUNT(*) as count 
      FROM student_interactions 
      WHERE category IS NOT NULL AND category != '' 
      GROUP BY category
    `);
    
    client.release();
    
    const categories = {};
    categoryResult.rows.forEach(row => {
      categories[row.category] = parseInt(row.count);
    });
    
    res.json({
      totalInteractions: parseInt(totalResult.rows[0].total),
      sessions: parseInt(sessionResult.rows[0].sessions),
      uniqueStudents: parseInt(studentResult.rows[0].students),
      categories,
      serverStatus: 'online',
      database: 'connected'
    });
    
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// Get student-specific data (for educators)
app.get('/student/:name', async (req, res) => {
  try {
    const studentName = req.params.name;
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT * FROM student_interactions 
      WHERE student_name = $1 
      ORDER BY timestamp ASC
    `, [studentName]);
    
    client.release();
    
    res.json({
      student: studentName,
      totalInteractions: result.rows.length,
      interactions: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error getting student data:', error);
    res.status(500).json({ error: 'Failed to get student data' });
  }
});

// Get class-specific data
app.get('/class/:className', async (req, res) => {
  try {
    const className = req.params.className;
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT * FROM student_interactions 
      WHERE class_name = $1 
      ORDER BY timestamp ASC
    `, [className]);
    
    client.release();
    
    res.json({
      class: className,
      totalInteractions: result.rows.length,
      interactions: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error getting class data:', error);
    res.status(500).json({ error: 'Failed to get class data' });
  }
});

// Serve the main application
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: 'Database connection failed',
      database: 'disconnected'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('❌ Server error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
  await initializeDatabase();
  
  app.listen(PORT, () => {
    console.log('🚀 Student AI Assistant Server Started');
    console.log('=====================================');
    console.log(`📍 Server running on port: ${PORT}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('📝 Permanent database logging active');
    console.log('💾 All data persists across server restarts');
    console.log('=====================================');
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
