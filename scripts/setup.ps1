# Stellar Project Setup Script (PowerShell)
# This script sets up the entire Stellar ecosystem for development

param(
    [switch]$SkipDocker,
    [switch]$SkipTests,
    [switch]$Verbose
)

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    } else {
        $input | Write-Output
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Info($message) {
    Write-ColorOutput Cyan "[INFO] $message"
}

function Write-Success($message) {
    Write-ColorOutput Green "[SUCCESS] $message"
}

function Write-Warning($message) {
    Write-ColorOutput Yellow "[WARNING] $message"
}

function Write-Error($message) {
    Write-ColorOutput Red "[ERROR] $message"
}

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        $majorVersion = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($majorVersion -lt 18) {
            Write-Error "Node.js version 18+ is required. Current version: $nodeVersion"
            exit 1
        }
        Write-Success "Node.js $nodeVersion found"
    } catch {
        Write-Error "Node.js is not installed. Please install Node.js 18+"
        exit 1
    }
    
    # Check npm
    try {
        $npmVersion = npm --version
        Write-Success "npm $npmVersion found"
    } catch {
        Write-Error "npm is not installed"
        exit 1
    }
    
    # Check Git
    try {
        $gitVersion = git --version
        Write-Success "Git $gitVersion found"
    } catch {
        Write-Error "Git is not installed"
        exit 1
    }
    
    # Check Docker (optional)
    if (-not $SkipDocker) {
        try {
            $dockerVersion = docker --version
            Write-Success "Docker $dockerVersion found"
        } catch {
            Write-Warning "Docker is not installed. Docker is recommended for development"
        }
        
        try {
            $dockerComposeVersion = docker-compose --version
            Write-Success "Docker Compose $dockerComposeVersion found"
        } catch {
            Write-Warning "Docker Compose is not installed. Docker Compose is recommended for development"
        }
    }
    
    Write-Success "Prerequisites check completed"
}

# Setup environment files
function Initialize-Environment {
    Write-Info "Setting up environment files..."
    
    # Copy environment files if they don't exist
    if (-not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Write-Success "Created .env file from template"
        Write-Warning "Please update .env with your configuration"
    } else {
        Write-Warning ".env file already exists, skipping creation"
    }
    
    # Create environment files for each module
    $modules = @("backend", "frontend", "contracts")
    foreach ($module in $modules) {
        if (Test-Path $module) {
            $envFile = Join-Path $module ".env"
            $envExample = Join-Path $module ".env.example"
            if ((-not (Test-Path $envFile)) -and (Test-Path $envExample)) {
                Copy-Item $envExample $envFile
                Write-Info "Created $envFile from template"
            }
        }
    }
}

# Install dependencies for all modules
function Install-Dependencies {
    Write-Info "Installing dependencies..."
    
    # Install root dependencies
    if (Test-Path "package.json") {
        Write-Info "Installing root dependencies..."
        npm install
    }
    
    # Install shared dependencies
    if (Test-Path "shared") {
        Write-Info "Installing shared dependencies..."
        Set-Location "shared"
        npm install
        npm run build
        Set-Location ".."
    }
    
    # Install backend dependencies
    if (Test-Path "backend") {
        Write-Info "Installing backend dependencies..."
        Set-Location "backend"
        npm install
        Set-Location ".."
    }
    
    # Install frontend dependencies
    if (Test-Path "frontend") {
        Write-Info "Installing frontend dependencies..."
        Set-Location "frontend"
        npm install
        Set-Location ".."
    }
    
    # Install contract dependencies
    if (Test-Path "contracts") {
        Write-Info "Installing contract dependencies..."
        Set-Location "contracts"
        npm install
        Set-Location ".."
    }
    
    Write-Success "Dependencies installation completed"
}

# Setup database
function Initialize-Database {
    Write-Info "Setting up database..."
    
    # Check if PostgreSQL is available
    try {
        $pgVersion = psql --version
        Write-Info "PostgreSQL found"
        
        # Create database if it doesn't exist
        $dbExists = psql -lqt | cut -d \| -f 1 | grep -qw stellar_db
        if (-not $dbExists) {
            Write-Info "Creating database..."
            try {
                createdb stellar_db
                Write-Success "Database created successfully"
            } catch {
                Write-Warning "Could not create database (may need permissions)"
            }
        }
    } catch {
        Write-Warning "PostgreSQL not found. Please install PostgreSQL or use Docker"
    }
    
    # Check if Redis is available
    try {
        $redisVersion = redis-cli --version
        Write-Info "Redis found"
    } catch {
        Write-Warning "Redis not found. Please install Redis or use Docker"
    }
}

# Build the project
function Build-Project {
    Write-Info "Building the project..."
    
    # Build shared module
    if (Test-Path "shared") {
        Write-Info "Building shared module..."
        Set-Location "shared"
        npm run build
        Set-Location ".."
    }
    
    # Build backend
    if (Test-Path "backend") {
        Write-Info "Building backend..."
        Set-Location "backend"
        npm run build
        Set-Location ".."
    }
    
    # Build frontend
    if (Test-Path "frontend") {
        Write-Info "Building frontend..."
        Set-Location "frontend"
        npm run build
        Set-Location ".."
    }
    
    # Compile contracts
    if (Test-Path "contracts") {
        Write-Info "Compiling contracts..."
        Set-Location "contracts"
        npm run compile
        Set-Location ".."
    }
    
    Write-Success "Project build completed"
}

# Setup Git hooks
function Initialize-GitHooks {
    Write-Info "Setting up Git hooks..."
    
    # Create .git/hooks directory if it doesn't exist
    $hooksDir = ".git\hooks"
    if (-not (Test-Path $hooksDir)) {
        New-Item -ItemType Directory -Path $hooksDir -Force
    }
    
    # Create pre-commit hook
    $preCommitHook = @"
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
"@
    
    $preCommitPath = Join-Path $hooksDir "pre-commit"
    $preCommitHook | Out-File -FilePath $preCommitPath -Encoding utf8
    
    Write-Success "Git hooks setup completed"
}

# Create development scripts
function New-DevelopmentScripts {
    Write-Info "Creating development scripts..."
    
    # Create dev.ps1 script
    $devScript = @"
# Development script for Stellar

param(`$1)

switch (`$1) {
    "start" {
        Write-Host "Starting Stellar development environment..."
        docker-compose up -d
    }
    "stop" {
        Write-Host "Stopping Stellar development environment..."
        docker-compose down
    }
    "restart" {
        Write-Host "Restarting Stellar development environment..."
        docker-compose restart
    }
    "logs" {
        Write-Host "Showing logs..."
        docker-compose logs -f
    }
    "clean" {
        Write-Host "Cleaning up..."
        docker-compose down -v
        docker system prune -f
    }
    "test" {
        Write-Host "Running tests..."
        npm test
    }
    "lint" {
        Write-Host "Running linter..."
        npm run lint
    }
    "build" {
        Write-Host "Building project..."
        npm run build
    }
    default {
        Write-Host "Usage: .\dev.ps1 {start|stop|restart|logs|clean|test|lint|build}"
        exit 1
    }
}
"@
    
    $devScript | Out-File -FilePath "dev.ps1" -Encoding utf8
    
    Write-Success "Development scripts created"
}

# Run initial tests
function Invoke-InitialTests {
    if ($SkipTests) {
        Write-Warning "Skipping tests as requested"
        return
    }
    
    Write-Info "Running initial tests..."
    
    # Test shared module
    if (Test-Path "shared") {
        Write-Info "Testing shared module..."
        Set-Location "shared"
        try {
            npm test
            Write-Success "Shared module tests passed"
        } catch {
            Write-Warning "Shared module tests failed"
        }
        Set-Location ".."
    }
    
    # Test backend
    if (Test-Path "backend") {
        Write-Info "Testing backend..."
        Set-Location "backend"
        try {
            npm test
            Write-Success "Backend tests passed"
        } catch {
            Write-Warning "Backend tests failed"
        }
        Set-Location ".."
    }
    
    # Test contracts
    if (Test-Path "contracts") {
        Write-Info "Testing contracts..."
        Set-Location "contracts"
        try {
            npm test
            Write-Success "Contract tests passed"
        } catch {
            Write-Warning "Contract tests failed"
        }
        Set-Location ".."
    }
    
    Write-Success "Initial tests completed"
}

# Display setup completion message
function Show-Completion {
    Write-Success "Stellar setup completed successfully!"
    Write-Host ""
    Write-Host "🚀 Next steps:" -ForegroundColor Green
    Write-Host "1. Update your .env file with proper configuration"
    Write-Host "2. Start the development environment: .\dev.ps1 start"
    Write-Host "3. Visit http://localhost:3000 to access the application"
    Write-Host "4. Check the documentation in the docs/ directory"
    Write-Host ""
    Write-Host "📚 Useful commands:" -ForegroundColor Green
    Write-Host "- .\dev.ps1 start    - Start development environment"
    Write-Host "- .\dev.ps1 stop     - Stop development environment"
    Write-Host "- .\dev.ps1 logs     - View logs"
    Write-Host "- .\dev.ps1 test     - Run tests"
    Write-Host "- .\dev.ps1 lint     - Run linter"
    Write-Host "- .\dev.ps1 build    - Build project"
    Write-Host ""
    Write-Host "🔗 Important links:" -ForegroundColor Green
    Write-Host "- Frontend: http://localhost:3000"
    Write-Host "- Backend API: http://localhost:3001"
    Write-Host "- Documentation: ./docs/"
    Write-Host "- Contributing: ./CONTRIBUTING.md"
    Write-Host ""
    Write-Host "🤝 Happy contributing to Stellar!" -ForegroundColor Green
}

# Main execution
function Main {
    Write-Host "🌟 Stellar Setup Script (PowerShell)" -ForegroundColor Cyan
    Write-Host "==============================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($Verbose) {
        $VerbosePreference = "Continue"
    }
    
    Test-Prerequisites
    Initialize-Environment
    Install-Dependencies
    Initialize-Database
    Build-Project
    Initialize-GitHooks
    New-DevelopmentScripts
    Invoke-InitialTests
    Show-Completion
}

# Run main function
Main
