
// GET /api/source-images - List images from server/source_content/YYYY-MM-DD
app.get('/api/source-images', (req, res) => {
    const dateStr = req.query.date; // Expect YYYY-MM-DD
    if (!dateStr) {
        return res.status(400).json({ error: 'Date query param required (YYYY-MM-DD)' });
    }

    const sourceDir = path.join(__dirname, 'source_content', dateStr);

    if (!fs.existsSync(sourceDir)) {
        // Create it if it doesn't exist so user can drop files there
        fs.mkdirSync(sourceDir, { recursive: true });
        return res.json({ images: [] });
    }

    fs.readdir(sourceDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        // Filter for images
        const images = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
        res.json({ images });
    });
});

// Serve source content statically as well
app.use('/source_content', express.static(path.join(__dirname, 'source_content')));
