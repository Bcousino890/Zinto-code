#!/bin/bash

# Docker Restart Monitor Script
# Monitors for restart signals from the auto-update service and restarts the container

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RESTART_SIGNAL_PATH="$PROJECT_DIR/volumes/restart-signal"
APP_UPDATES_PATH="$PROJECT_DIR/volumes/app-updates"
CONTAINER_NAME="bothive-app"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Function to apply staged updates
apply_staged_updates() {
    if [ -d "$APP_UPDATES_PATH" ]; then
        log "Applying staged application updates..."
        
        # Copy staged updates to the container
        if docker cp "$APP_UPDATES_PATH/." "$CONTAINER_NAME:/app/"; then
            log_success "Application updates applied successfully"
            
            # Clean up staged updates
            rm -rf "$APP_UPDATES_PATH"/*
            log "Cleaned up staged updates"
        else
            log_error "Failed to apply application updates"
            return 1
        fi
    else
        log "No staged updates found"
    fi
}

# Function to restart the container
restart_container() {
    local signal_data="$1"
    
    log "Processing restart signal: $signal_data"
    
    # Extract version from signal if available
    local version=$(echo "$signal_data" | grep -o '"version":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$version" ]; then
        log "Restarting for version: $version"
    fi
    
    # Apply any staged updates before restart
    apply_staged_updates
    
    log "Restarting container: $CONTAINER_NAME"
    
    # Restart the container using docker-compose
    cd "$PROJECT_DIR"
    if docker-compose restart app; then
        log_success "Container restarted successfully"
        
        # Wait for container to be healthy
        log "Waiting for container to be ready..."
        sleep 10
        
        # Check if container is running
        if docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
            log_success "Container is running and ready"
        else
            log_error "Container failed to start properly"
        fi
    else
        log_error "Failed to restart container"
    fi
}

# Function to monitor for restart signals
monitor_restart_signals() {
    log "Starting Docker restart monitor..."
    log "Monitoring: $RESTART_SIGNAL_PATH"
    log "Container: $CONTAINER_NAME"
    
    while true; do
        if [ -f "$RESTART_SIGNAL_PATH" ]; then
            log "Restart signal detected!"
            
            # Read the signal data
            signal_data=$(cat "$RESTART_SIGNAL_PATH" 2>/dev/null)
            
            # Remove the signal file
            rm -f "$RESTART_SIGNAL_PATH"
            
            # Process the restart
            restart_container "$signal_data"
            
            log "Restart processing completed. Resuming monitoring..."
        fi
        
        # Check every 5 seconds
        sleep 5
    done
}

# Function to setup monitoring directories
setup_directories() {
    local volumes_dir="$PROJECT_DIR/volumes"
    
    # Create volumes directory if it doesn't exist
    mkdir -p "$volumes_dir"
    mkdir -p "$volumes_dir/updates"
    mkdir -p "$volumes_dir/backups"
    mkdir -p "$volumes_dir/app-updates"
    
    log "Monitoring directories setup complete"
}

# Main execution
main() {
    log "BotHivePlus Docker Restart Monitor"
    log "===================================="
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_DIR/docker-compose.yml" ]; then
        log_error "docker-compose.yml not found in $PROJECT_DIR"
        exit 1
    fi
    
    # Setup directories
    setup_directories
    
    # Start monitoring
    monitor_restart_signals
}

# Handle script termination
trap 'log "Restart monitor stopped"; exit 0' SIGINT SIGTERM

# Run main function
main "$@"
