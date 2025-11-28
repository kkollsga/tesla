# Tesla Streaming Launcher

🚀 **[Launch App](https://kkollsga.github.io/tesla)**

A unified streaming and gaming launcher designed for Tesla browsers. Access your favorite streaming services and play classic board games - all in one place with a clean, modern interface.

## 🎬 Streaming Services

Quick access to popular streaming platforms:
- **Netflix** - Movies and TV shows
- **Plex** - Personal media streaming
- **YouTube** - Video platform
- **TV2** - Norwegian broadcaster
- **NRK** - Norwegian public broadcaster
- **Viaplay** - Nordic streaming service
- **HBO Max** - Premium entertainment
- **Apple TV** - Apple's streaming service
- **Globo** - Brazilian entertainment

## 🎮 Board Games

A collection of classic and modern board games built with vanilla HTML, CSS, and JavaScript:
- **Chess** - Classic chess with all standard rules
- **Backgammon** - Traditional backgammon board game
- **Hive** - Strategic abstract game with hexagonal tiles
- **Damme** - Classic checkers/draughts
- **Isola** - Two-player abstract strategy game
- **Santorini** - Build and climb to victory
- **Solitaire** - Classic card patience game
- **Sudoku** - Number puzzle game

## ✨ Features

- 🚗 **Tesla Browser Optimized** - Special navigation handling for Tesla browser
- ⭐ **Favorite Game** - Quick access to your most-played game
- 🎨 **Clean, modern UI** - Sleek dark theme with service-specific accents
- 🎯 **Fully playable games** - Complete rule implementation with no external dependencies
- 📱 **Responsive design** - Works on desktop and mobile
- 🎭 **Dynamic theming** - Games feature theme colors based on game state
- 🏆 **Victory animations** - Celebrations and effects in games
- ⚡ **No build tools required** - Pure vanilla HTML, CSS, and JavaScript
- 🎮 **Local multiplayer** - Hot-seat gameplay for board games
- 🔄 **Fullscreen support** - Dedicated fullscreen mode

## 🚀 Getting Started

### Prerequisites

No installation required! Just a modern web browser (optimized for Tesla browser).

### Running Locally

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd tesla
   ```

2. Open `index.html` in your browser:
   ```bash
   open index.html
   ```

   Or use a local server:
   ```bash
   python -m http.server 8000
   # Then navigate to http://localhost:8000
   ```

3. Click on any streaming service to launch it, or click "Games" to choose a board game!

### Using the Launcher

- **Main Grid**: Click any service icon to navigate to that streaming platform
- **Games Button**: Opens a modal with all available board games
- **Favorite Game**: Bottom-left slot shows your favorite game for quick access
- **Fullscreen**: Click the fullscreen button to enter fullscreen mode
- **Set Favorite**: In the games modal, click the ★ icon on any game to make it your favorite

## 🛠️ Technology Stack

- **HTML5** - Structure and markup
- **CSS3** - Styling with modern features (Grid, Flexbox, Custom Properties)
- **Vanilla JavaScript** - Game logic and interactions
- **SVG** - Game pieces and icons
- **Font Awesome** - UI icons

## 🎨 Theme System

Games feature dynamic theming:
- **Green** - Default theme
- **Blue** - Left player victory theme
- **Orange** - Right player victory theme

Theme persists across new games until page refresh.

## 📁 Project Structure

```
tesla/
├── index.html          # Main launcher (streaming services + games grid)
├── games/              # Individual game files
│   ├── hive.html       # Hive game
│   ├── hive.js         # Hive game logic
│   ├── hive.css        # Hive game styling
│   ├── chess.html
│   ├── backgammon.html
│   ├── solitaire.html
│   ├── isola.html
│   ├── santorini.html
│   ├── damme.html
│   ├── sudoku.html
│   └── ...
├── icons/              # Service and game icons (SVG)
├── LICENSE             # MIT License
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## 🎯 Game Controls

### General Controls
- Click/tap to select pieces
- Drag and drop to move
- Info button (top-left) for game rules
- Exit button (top-right) to return to main menu

### Hive Specific
- **Zoom controls** - Zoom in/out and reset view
- **Pan** - Click and drag the board
- **New Game** - Start fresh game
- **Pass Turn** - Skip your turn when no moves available

## 🚗 Tesla Browser Optimization

The launcher includes special handling for Tesla's browser:

- **YouTube Redirect Hack**: Automatically uses YouTube redirect for specific Tesla browser distributions
- **Fullscreen Detection**: Intelligent detection of fullscreen mode including Tesla's implementation
- **Resolution Detection**: Detects Tesla-specific screen resolutions (1180x919)
- **Navigation Handling**: Custom navigation logic optimized for Tesla's browser behavior

To add more Tesla distributions, edit the `TESLA_DISTRIBUTIONS` array in [index.html](index.html).

## 🏗️ Development

The project uses vanilla JavaScript with no build process. To modify or extend:

### Launcher
- Main launcher code is in [index.html](index.html) (self-contained)
- Service icons are SVG files in the `icons/` directory
- To add a new service: Add a new link in the grid with appropriate icon and URL
- Game modal uses localStorage to persist favorite game selection

### Games
1. Each game is self-contained in its own HTML, CSS, and JS files
2. Game-specific styles are in individual CSS files (e.g., `hive.css`)
3. Game logic is in corresponding JavaScript files (e.g., `hive.js`)
4. All games follow similar structure for consistency
5. Games support dynamic theming (green, blue, orange) based on game state

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest new features or streaming services
- Submit pull requests
- Add new games
- Improve Tesla browser compatibility
- Enhance UI/UX design

## 🎮 How to Play

Each game includes an info button (ℹ️) in the top-left corner that displays:
- Game objective
- Rules and mechanics
- Movement patterns
- Win conditions

Click the info button in any game to learn how to play!

## 🌟 Highlights

### Launcher Features
- **Unified Interface**: Access 9 streaming services and 8 board games from one place
- **Favorite System**: Star your favorite game for quick access from the main grid
- **Modal Selection**: Beautiful game selection modal with hover effects and color-coded borders
- **Service-Specific Styling**: Each service has its own brand color and glow effects
- **LocalStorage Persistence**: Your favorite game preference is saved across sessions

### Hive Game Features
- Hexagonal grid system with pointy-top orientation
- Full expansion support (Mosquito, Ladybug, Pillbug)
- Tournament rules mode
- Victory animations with falling pieces
- Comprehensive move validation
- Visual feedback for valid moves
- Zoom and pan controls
- Dynamic theming (green/blue/orange)

### Other Games
- **Chess**: Full rule implementation with check/checkmate detection
- **Backgammon**: Traditional rules with dice rolling
- **Santorini**: Worker placement and building mechanics
- **Isola**: Strategic board destruction gameplay
- **Damme**: Classic checkers with king promotion
- **Solitaire**: Classic Klondike solitaire
- **Sudoku**: Puzzle generation with difficulty levels

---

Made with ❤️ using vanilla JavaScript
