# Competitive Intelligence Dashboard

A professional business intelligence dashboard for tracking competitor stock performance in the technology sector. Built with vanilla JavaScript and designed for deployment on Vercel.

**Class Project**: MGIS130 - Business Intelligence Dashboard with automated data retrieval and export functionality. For use by RIT Saunders College of Business students.

## Features

- **Real-time Stock Tracking**: Monitors 5 major tech companies (Apple, Microsoft, Google, Meta, Amazon)
- **Professional UI**: High-contrast design suitable for business presentations
- **Data Export**: One-click CSV export for reports and presentations
- **Responsive Design**: Works seamlessly on mobile and desktop devices
- **Accessibility**: WCAG AA compliant with high contrast ratios
- **Loading States**: Professional loading and error handling
- **Visual Indicators**: Highest price (green) and lowest price (red) highlighting

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Vercel Serverless Functions (Node.js)
- **API**: API Ninjas Stock Price API
- **Deployment**: Vercel

## Project Structure

```
├── api/
│   └── stocks.js          # Serverless function for stock data
├── index.html             # Dashboard frontend
├── vercel.json            # Vercel deployment configuration
├── .env.example           # Environment variables template
└── README.md              # This file
```

## Setup Instructions

### 1. Get API Key

1. Visit [API Ninjas](https://api-ninjas.com/)
2. Sign up for a free account
3. Navigate to your profile to get your API key

### 2. Local Development (Optional)

If you want to test locally before deploying:

```bash
# Install Vercel CLI
npm install -g vercel

# Create .env file
cp .env.example .env

# Add your API key to .env
echo "API_KEY=your_actual_api_key" > .env

# Run development server
vercel dev
```

Visit `http://localhost:3000` to see your dashboard.

### 3. Deploy to Vercel

#### Option A: Deploy with Vercel CLI

```bash
# Login to Vercel
vercel login

# Deploy
vercel

# Add environment variable
vercel env add API_KEY
# Paste your API key when prompted
# Select "Production" when asked for environment

# Deploy to production
vercel --prod
```

#### Option B: Deploy via Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "New Project"
3. Import your GitHub repository
4. Add environment variable:
   - Name: `API_KEY`
   - Value: Your API Ninjas API key
5. Click "Deploy"

## Usage

### Dashboard Features

- **Refresh Data**: Click the "🔄 Refresh Data" button to fetch the latest stock prices
- **Export to CSV**: Click the "📥 Export to CSV" button to download data for reports
- **Auto-refresh**: Uncomment the `setInterval` line in `index.html` (line 672) to enable automatic updates every 5 minutes

### API Endpoint

The serverless function is available at `/api/stocks` and returns:

```json
{
  "success": true,
  "timestamp": "2025-11-10T12:00:00.000Z",
  "data": [
    {
      "ticker": "AAPL",
      "companyName": "Apple Inc.",
      "price": 150.25,
      "timestamp": "2025-11-10T12:00:00.000Z",
      "success": true
    }
    // ... more companies
  ]
}
```

## Business Applications

This dashboard is designed for:

- **Competitive Analysis**: Quick visual comparison of competitor stock performance
- **Board Presentations**: Professional, high-contrast design suitable for presentations
- **Investment Research**: Real-time tracking of technology sector leaders
- **Report Generation**: CSV export for integration with business reports
- **Market Monitoring**: Track competitive positioning through stock performance

## Customization

### Adding More Companies

Edit `api/stocks.js` and add companies to the `COMPANIES` array:

```javascript
const COMPANIES = [
  { ticker: 'AAPL', name: 'Apple Inc.' },
  { ticker: 'TSLA', name: 'Tesla Inc.' },  // Add your company here
  // ...
];
```

### Changing Color Scheme

Edit CSS variables in `index.html` (lines 36-47):

```css
:root {
  --primary-bg: #0a0e27;
  --accent-blue: #4a90e2;
  /* ... customize colors */
}
```

### Enable Auto-refresh

Uncomment line 672 in `index.html`:

```javascript
setInterval(fetchStockData, 5 * 60 * 1000); // Refresh every 5 minutes
```

## Performance Optimization

- **Parallel API Calls**: All stock data is fetched concurrently for faster loading
- **Error Resilience**: If one stock fails, others continue to load
- **Caching**: Browser caching enabled for static assets
- **Lazy Loading**: Data only loads when needed

## Security Features

- **API Key Protection**: Environment variables keep API keys secure
- **CORS Headers**: Properly configured for secure cross-origin requests
- **Input Validation**: Server-side validation of all inputs
- **Error Handling**: Comprehensive error handling prevents data leaks

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility

- WCAG AA compliant color contrast ratios
- Keyboard navigation support
- Screen reader compatible
- Semantic HTML structure
- Focus indicators for all interactive elements

## License

This project is provided as-is for business and educational purposes.

## Support

For issues or questions:
1. Check the API Ninjas documentation: https://api-ninjas.com/api/stockprice
2. Verify your API key is correctly configured in Vercel environment variables
3. Check Vercel deployment logs for errors

## Future Enhancements

Potential improvements for future versions:

- Historical price charts
- Percentage change calculations
- Real-time updates with WebSockets
- Multiple sector support
- Customizable watchlists
- Price alerts and notifications
- Mobile app version

---

Built for MGIS130 Business Intelligence course
