const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const CSV_FILE = path.join(__dirname, 'student_interactions.csv');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files from current directory

// CSV Headers
const CSV_HEADERS = [
    'Timestamp',
    'Session_ID',
    'Student_Name',
    'Class',
    'Question_Number',
    'Interaction_Type',
    'Question',
    'AI_Response_Preview',
    'Category',
    'Risk_Level',
    'Flags',
    'Word_Count',
    'Analysis_Details'
];

// Initialize CSV file with headers if it doesn't exist
function initializeCSV() {
    if (!fs.existsSync(CSV_FILE)) {
        const headerRow = CSV_HEADERS.join(',') + '\n';
        fs.writeFileSync(CSV_FILE, headerRow);
        console.log('✅ Created new CSV file: student_interactions.csv');
    } else {
        console.log('📁 Using existing CSV file: student_interactions.csv');
    }
}

// Escape CSV values
function escapeCSV(value) {
    if (typeof value !== 'string') {
        value = String(value || '');
    }
    
    // If the value contains commas, quotes, or newlines, wrap in quotes and escape internal quotes
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

// Format log entry as CSV row
function formatCSVRow(logEntry) {
    const row = [
        escapeCSV(logEntry.timestamp),
        escapeCSV(logEntry.sessionId),
        escapeCSV(logEntry.student?.name || 'N/A'),
        escapeCSV(logEntry.student?.class || 'N/A'),
        escapeCSV(logEntry.questionNumber || ''),
        escapeCSV(logEntry.type),
        escapeCSV(logEntry.question || ''),
        escapeCSV(logEntry.response || ''),
        escapeCSV(logEntry.category || ''),
        escapeCSV(logEntry.analysis?.riskLevel || ''),
        escapeCSV((logEntry.analysis?.flags || []).join('; ')),
        escapeCSV(logEntry.analysis?.wordCount || ''),
        escapeCSV(JSON.stringify(logEntry.analysis || {}))
    ];
    
    return row.join(',') + '\n';
}

// Routes
app.get('/status', (req, res) => {
    res.json({ 
        status: 'online', 
        csvFile: CSV_FILE,
        timestamp: new Date().toISOString()
    });
});

app.post('/log', (req, res) => {
    try {
        const logEntry = req.body;
        
        // Validate required fields
        if (!logEntry.sessionId || !logEntry.timestamp) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Format and append to CSV
        const csvRow = formatCSVRow(logEntry);
        fs.appendFileSync(CSV_FILE, csvRow);
        
        console.log(`📝 Logged: ${logEntry.type} - ${logEntry.student?.name || 'Anonymous'} - ${logEntry.category || 'N/A'}`);
        
        res.json({ success: true, message: 'Logged successfully' });
        
    } catch (error) {
        console.error('❌ Error logging to CSV:', error);
        res.status(500).json({ error: 'Failed to log interaction' });
    }
});

app.get('/csv', (req, res) => {
    try {
        if (fs.existsSync(CSV_FILE)) {
            const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
            res.setHeader('Content-Type', 'text/plain');
            res.send(csvContent);
        } else {
            res.status(404).json({ error: 'CSV file not found' });
        }
    } catch (error) {
        console.error('❌ Error reading CSV:', error);
        res.status(500).json({ error: 'Failed to read CSV file' });
    }
});

app.get('/csv/download', (req, res) => {
    try {
        if (fs.existsSync(CSV_FILE)) {
            const filename = `student_interactions_${new Date().toISOString().split('T')[0]}.csv`;
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            
            const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
            res.send(csvContent);
        } else {
            res.status(404).json({ error: 'CSV file not found' });
        }
    } catch (error) {
        console.error('❌ Error downloading CSV:', error);
        res.status(500).json({ error: 'Failed to download CSV file' });
    }
});

// Get CSV statistics
app.get('/stats', (req, res) => {
    try {
        if (!fs.existsSync(CSV_FILE)) {
            return res.json({ 
                totalInteractions: 0,
                sessions: 0,
                students: [],
                categories: {}
            });
        }
        
        const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
        const lines = csvContent.split('\n').filter(line => line.trim());
        
        // Skip header row
        const dataLines = lines.slice(1);
        
        const sessions = new Set();
        const students = new Set();
        const categories = {};
        
        dataLines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 9) {
                sessions.add(parts[1]); // Session ID
                students.add(parts[2]); // Student name
                
                const category = parts[8]; // Category
                if (category && category !== '""') {
                    categories[category] = (categories[category] || 0) + 1;
                }
            }
        });
        
        res.json({
            totalInteractions: dataLines.length,
            sessions: sessions.size,
            students: Array.from(students).filter(s => s && s !== '"N/A"'),
            categories
        });
        
    } catch (error) {
        console.error('❌ Error getting stats:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling
app.use((error, req, res, next) => {
    console.error('❌ Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// Initialize CSV and start server
initializeCSV();

app.listen(PORT, () => {
    console.log('🚀 Student AI Assistant Server Started');
    console.log('=====================================');
    console.log(`📍 Server running at: http://localhost:${PORT}`);
    console.log(`📁 CSV log file: ${CSV_FILE}`);
    console.log(`🌐 Access the app: http://localhost:${PORT}`);
    console.log('=====================================');
    console.log('📝 All student interactions will be automatically logged to CSV');
    console.log('⏹️  Press Ctrl+C to stop the server');
    console.log('');
});