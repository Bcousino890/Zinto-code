#!/bin/bash

# Test script for Docker auto-update functionality
# This script tests the Docker-aware auto-update system

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Test Docker environment detection
test_docker_detection() {
    log "Testing Docker environment detection..."
    
    # Check if DOCKER_CONTAINER env var is set
    if docker-compose exec -T app printenv DOCKER_CONTAINER | grep -q "true"; then
        log_success "DOCKER_CONTAINER environment variable is set correctly"
    else
        log_error "DOCKER_CONTAINER environment variable not set"
        return 1
    fi
    
    # Test the detection method in the application
    local result=$(docker-compose exec -T app node -e "
        const fs = require('fs');
        const detectDocker = () => {
            if (process.env.DOCKER_CONTAINER === 'true') return true;
            try { return fs.existsSync('/.dockerenv'); } catch { return false; }
        };

    ")
    
    if echo "$result" | grep -q "true"; then
        log_success "Docker detection logic works correctly"
    else
        log_error "Docker detection logic failed"
        return 1
    fi
}

# Test volume mounts
test_volume_mounts() {
    log "Testing volume mounts..."
    
    local volumes=("updates" "backups" "app-updates")
    
    for volume in "${volumes[@]}"; do
        if docker-compose exec -T app test -d "/app/volumes/$volume"; then
            log_success "Volume mount exists: /app/volumes/$volume"
        else
            log_error "Volume mount missing: /app/volumes/$volume"
            return 1
        fi
    done
    
    # Test write permissions
    if docker-compose exec -T app touch "/app/volumes/test-write"; then
        log_success "Write permissions work on volumes"
        docker-compose exec -T app rm -f "/app/volumes/test-write"
    else
        log_error "No write permissions on volumes"
        return 1
    fi
}

# Test auto-update service initialization
test_service_initialization() {
    log "Testing auto-update service initialization..."
    
    # Check if the service starts without errors
    local logs=$(docker-compose logs app 2>&1 | grep -i "auto-update.*initialized")
    
    if [ -n "$logs" ]; then
        log_success "Auto-update service initialized successfully"
        echo "  $logs"
    else
        log_warning "Auto-update service initialization not found in logs"
        log "Recent logs:"
        docker-compose logs --tail=10 app | grep -i auto-update || log "No auto-update logs found"
    fi
}

# Test restart signal mechanism
test_restart_signal() {
    log "Testing restart signal mechanism..."
    
    # Create a test restart signal
    local test_signal='{"timestamp":"'$(date -Iseconds)'","reason":"test","version":"test-1.0.0"}'
    
    if docker-compose exec -T app sh -c "echo '$test_signal' > /app/volumes/restart-signal"; then
        log_success "Can create restart signal file"
        
        # Check if file exists
        if docker-compose exec -T app test -f "/app/volumes/restart-signal"; then
            log_success "Restart signal file created successfully"
            
            # Clean up
            docker-compose exec -T app rm -f "/app/volumes/restart-signal"
        else
            log_error "Restart signal file not found after creation"
            return 1
        fi
    else
        log_error "Cannot create restart signal file"
        return 1
    fi
}

# Test API endpoints
test_api_endpoints() {
    log "Testing auto-update API endpoints..."
    
    # Wait for application to be ready
    sleep 5
    
    # Test update status endpoint
    local status_response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/api/v1/system/update/status)
    
    if [ "$status_response" = "200" ]; then
        log_success "Update status API endpoint is accessible"
    else
        log_error "Update status API endpoint returned: $status_response"
        return 1
    fi
}

# Test directory structure
test_directory_structure() {
    log "Testing directory structure..."
    
    local expected_dirs=(
        "/app/volumes"
        "/app/volumes/updates"
        "/app/volumes/backups"
        "/app/volumes/app-updates"
    )
    
    for dir in "${expected_dirs[@]}"; do
        if docker-compose exec -T app test -d "$dir"; then
            log_success "Directory exists: $dir"
        else
            log_error "Directory missing: $dir"
            return 1
        fi
    done
}

# Main test execution
main() {
    log "BotHivePlus Docker Auto-Update Test Suite"
    log "==========================================="
    
    # Check if Docker Compose is running
    if ! docker-compose ps | grep -q "bothive-app.*Up"; then
        log_error "BotHivePlus is not running. Please start it first:"
        log "  docker-compose up -d"
        exit 1
    fi
    
    local failed_tests=0
    
    # Run tests
    test_docker_detection || ((failed_tests++))
    echo
    
    test_volume_mounts || ((failed_tests++))
    echo
    
    test_directory_structure || ((failed_tests++))
    echo
    
    test_service_initialization || ((failed_tests++))
    echo
    
    test_restart_signal || ((failed_tests++))
    echo
    
    test_api_endpoints || ((failed_tests++))
    echo
    
    # Summary
    log "Test Summary"
    log "============"
    
    if [ $failed_tests -eq 0 ]; then
        log_success "All tests passed! Docker auto-update is ready to use."
        log ""
        log "Next steps:"
        log "1. Start the restart monitor: ./scripts/docker-restart-monitor.sh &"
        log "2. Monitor logs: docker-compose logs -f app"
        log "3. Test with a real update package"
    else
        log_error "$failed_tests test(s) failed. Please fix the issues before using auto-update."
        exit 1
    fi
}

# Run main function
main "$@"
