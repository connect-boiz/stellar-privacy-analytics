#!/bin/bash

# Stellar Project Setup Script
# This script sets up the entire Stellar ecosystem for development

set -e

echo "🌟 Setting up Stellar Privacy-First Analytics Ecosystem..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18+ is required. Current version: $(node -v)"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_warning "Docker is not installed. Docker is recommended for development"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        print_warning "Docker Compose is not installed. Docker Compose is recommended for development"
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        print_error "Git is not installed"
        exit 1
    fi
    
    print_success "Prerequisites check completed"
}

# Setup environment files
setup_environment() {
    print_status "Setting up environment files..."
    
    # Copy environment files if they don't exist
    if [ ! -f .env ]; then
        cp .env.example .env
        print_success "Created .env file from template"
        print_warning "Please update .env with your configuration"
    else
        print_warning ".env file already exists, skipping creation"
    fi
    
    # Create environment files for each module
    modules=("backend" "frontend" "contracts")
    for module in "${modules[@]}"; do
        if [ -d "$module" ]; then
            if [ ! -f "$module/.env" ]; then
                cp "$module/.env.example" "$module/.env" 2>/dev/null || print_warning "No .env.example found for $module"
            fi
        fi
    done
}

# Install dependencies for all modules
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install root dependencies
    if [ -f package.json ]; then
        print_status "Installing root dependencies..."
        npm install
    fi
    
    # Install shared dependencies
    if [ -d shared ]; then
        print_status "Installing shared dependencies..."
        cd shared
        npm install
        npm run build
        cd ..
    fi
    
    # Install backend dependencies
    if [ -d backend ]; then
        print_status "Installing backend dependencies..."
        cd backend
        npm install
        cd ..
    fi
    
    # Install frontend dependencies
    if [ -d frontend ]; then
        print_status "Installing frontend dependencies..."
        cd frontend
        npm install
        cd ..
    fi
    
    # Install contract dependencies
    if [ -d contracts ]; then
        print_status "Installing contract dependencies..."
        cd contracts
        npm install
        cd ..
    fi
    
    print_success "Dependencies installation completed"
}

# Setup database
setup_database() {
    print_status "Setting up database..."
    
    # Check if PostgreSQL is available
    if command -v psql &> /dev/null; then
        print_status "PostgreSQL found"
        
        # Create database if it doesn't exist
        if ! psql -lqt | cut -d \| -f 1 | grep -qw stellar_db; then
            print_status "Creating database..."
            createdb stellar_db 2>/dev/null || print_warning "Could not create database (may need permissions)"
        fi
    else
        print_warning "PostgreSQL not found. Please install PostgreSQL or use Docker"
    fi
    
    # Check if Redis is available
    if command -v redis-cli &> /dev/null; then
        print_status "Redis found"
    else
        print_warning "Redis not found. Please install Redis or use Docker"
    fi
}

# Build the project
build_project() {
    print_status "Building the project..."
    
    # Build shared module
    if [ -d shared ]; then
        print_status "Building shared module..."
        cd shared
        npm run build
        cd ..
    fi
    
    # Build backend
    if [ -d backend ]; then
        print_status "Building backend..."
        cd backend
        npm run build
        cd ..
    fi
    
    # Build frontend
    if [ -d frontend ]; then
        print_status "Building frontend..."
        cd frontend
        npm run build
        cd ..
    fi
    
    # Compile contracts
    if [ -d contracts ]; then
        print_status "Compiling contracts..."
        cd contracts
        npm run compile
        cd ..
    fi
    
    print_success "Project build completed"
}

# Setup Git hooks
setup_git_hooks() {
    print_status "Setting up Git hooks..."
    
    # Create .git/hooks directory if it doesn't exist
    mkdir -p .git/hooks
    
    # Create pre-commit hook
    cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Pre-commit hook for Stellar

echo "Running pre-commit checks..."

# Run linting
npm run lint

# Run type checking
npm run type-check

# Run tests
npm test

echo "Pre-commit checks completed"
EOF
    
    chmod +x .git/hooks/pre-commit
    
    print_success "Git hooks setup completed"
}

# Create development scripts
create_dev_scripts() {
    print_status "Creating development scripts..."
    
    # Create dev.sh script
    cat > dev.sh << 'EOF'
#!/bin/bash
# Development script for Stellar

case "$1" in
    "start")
        echo "Starting Stellar development environment..."
        docker-compose up -d
        ;;
    "stop")
        echo "Stopping Stellar development environment..."
        docker-compose down
        ;;
    "restart")
        echo "Restarting Stellar development environment..."
        docker-compose restart
        ;;
    "logs")
        echo "Showing logs..."
        docker-compose logs -f
        ;;
    "clean")
        echo "Cleaning up..."
        docker-compose down -v
        docker system prune -f
        ;;
    "test")
        echo "Running tests..."
        npm test
        ;;
    "lint")
        echo "Running linter..."
        npm run lint
        ;;
    "build")
        echo "Building project..."
        npm run build
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|clean|test|lint|build}"
        exit 1
        ;;
esac
EOF
    
    chmod +x dev.sh
    
    print_success "Development scripts created"
}

# Run initial tests
run_tests() {
    print_status "Running initial tests..."
    
    # Test shared module
    if [ -d shared ]; then
        print_status "Testing shared module..."
        cd shared
        npm test || print_warning "Shared module tests failed"
        cd ..
    fi
    
    # Test backend
    if [ -d backend ]; then
        print_status "Testing backend..."
        cd backend
        npm test || print_warning "Backend tests failed"
        cd ..
    fi
    
    # Test contracts
    if [ -d contracts ]; then
        print_status "Testing contracts..."
        cd contracts
        npm test || print_warning "Contract tests failed"
        cd ..
    fi
    
    print_success "Initial tests completed"
}

# Display setup completion message
display_completion() {
    print_success "Stellar setup completed successfully!"
    echo ""
    echo "🚀 Next steps:"
    echo "1. Update your .env file with proper configuration"
    echo "2. Start the development environment: ./dev.sh start"
    echo "3. Visit http://localhost:3000 to access the application"
    echo "4. Check the documentation in the docs/ directory"
    echo ""
    echo "📚 Useful commands:"
    echo "- ./dev.sh start    - Start development environment"
    echo "- ./dev.sh stop     - Stop development environment"
    echo "- ./dev.sh logs     - View logs"
    echo "- ./dev.sh test     - Run tests"
    echo "- ./dev.sh lint     - Run linter"
    echo "- ./dev.sh build    - Build project"
    echo ""
    echo "🔗 Important links:"
    echo "- Frontend: http://localhost:3000"
    echo "- Backend API: http://localhost:3001"
    echo "- Documentation: ./docs/"
    echo "- Contributing: ./CONTRIBUTING.md"
    echo ""
    echo "🤝 Happy contributing to Stellar!"
}

# Main execution
main() {
    echo "🌟 Stellar Setup Script"
    echo "======================"
    echo ""
    
    check_prerequisites
    setup_environment
    install_dependencies
    setup_database
    build_project
    setup_git_hooks
    create_dev_scripts
    run_tests
    display_completion
}

# Run main function
main "$@"
