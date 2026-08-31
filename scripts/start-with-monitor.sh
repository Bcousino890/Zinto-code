#!/bin/bash

# Start Zinto with Docker restart monitoring
# This script starts both the application and the restart monitor

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Function to start the application
start_application() {
    log "Starting Zinto with Docker Compose..."
    cd "$PROJECT_DIR"
    
    # Start the application
    docker-compose up -d
    
    if [ $? -eq 0 ]; then
        log_success "Zinto started successfully"
        
        # Show running containers
        log "Running containers:"
        docker-compose ps
    else
        echo "Failed to start Zinto"
        exit 1
    fi
}

# Function to start the restart monitor in background
start_monitor() {
    log "Starting restart monitor in background..."
    
    # Make the monitor script executable
    chmod +x "$SCRIPT_DIR/docker-restart-monitor.sh"
    
    # Start the monitor in background
    nohup "$SCRIPT_DIR/docker-restart-monitor.sh" > "$PROJECT_DIR/logs/restart-monitor.log" 2>&1 &
    
    # Save the PID
    echo $! > "$PROJECT_DIR/restart-monitor.pid"
    
    log_success "Restart monitor started (PID: $!)"
    log "Monitor logs: $PROJECT_DIR/logs/restart-monitor.log"
}

# Function to setup log directory
setup_logs() {
    mkdir -p "$PROJECT_DIR/logs"
}

# Main execution
main() {
    log "Zinto Docker Startup with Auto-Update Support"
    log "=================================================="
    
    # Setup logs
    setup_logs
    
    # Start application
    start_application
    
    # Start monitor
    start_monitor
    
    log_success "Zinto is now running with auto-update support!"
    log ""
    log "Useful commands:"
    log "  View logs: docker-compose logs -f"
    log "  Stop: docker-compose down"
    log "  Monitor logs: tail -f $PROJECT_DIR/logs/restart-monitor.log"
    log "  Stop monitor: kill \$(cat $PROJECT_DIR/restart-monitor.pid)"
}

# Run main function
main "$@"
