#!/bin/bash

# Zinto Multi-Instance Setup Validation Script
# Usage: ./scripts/validate-setup.sh

set -e

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
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Validation functions
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check Docker
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        print_success "Docker installed: $docker_version"
        
        # Check if Docker is running
        if docker info &> /dev/null; then
            print_success "Docker is running"
        else
            print_error "Docker is not running"
            return 1
        fi
    else
        print_error "Docker is not installed"
        return 1
    fi
    
    # Check Docker Compose
    if command -v docker-compose &> /dev/null; then
        local compose_version=$(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)
        print_success "Docker Compose installed: $compose_version"
    else
        print_error "Docker Compose is not installed"
        return 1
    fi
    
    # Check system resources
    local total_mem=$(free -m | awk 'NR==2{print $2}')
    if [ $total_mem -gt 4000 ]; then
        print_success "System memory: ${total_mem}MB (sufficient)"
    else
        print_warning "System memory: ${total_mem}MB (may be insufficient for multiple instances)"
    fi
    
    # Check disk space
    local available_space=$(df -BG . | awk 'NR==2{print $4}' | sed 's/G//')
    if [ $available_space -gt 20 ]; then
        print_success "Available disk space: ${available_space}GB (sufficient)"
    else
        print_warning "Available disk space: ${available_space}GB (may be insufficient)"
    fi
    
    echo
}

check_files() {
    print_header "Checking Required Files"
    
    local required_files=(
        "Dockerfile"
        "docker-compose.template.yml"
        ".env.template"
        "scripts/deploy-instance.sh"
        "scripts/manage-instance.sh"
        "scripts/quick-setup.sh"
        "scripts/monitor-resources.sh"
        "scripts/backup-all.sh"
        "docker-entrypoint.sh"
        "package.json"
        "migrations/001-initial-schema.sql"
    )
    
    for file in "${required_files[@]}"; do
        if [ -f "$file" ]; then
            print_success "Found: $file"
        else
            print_error "Missing: $file"
        fi
    done
    
    echo
}

check_scripts() {
    print_header "Checking Script Permissions"
    
    local scripts=(
        "scripts/deploy-instance.sh"
        "scripts/manage-instance.sh"
        "scripts/quick-setup.sh"
        "scripts/monitor-resources.sh"
        "scripts/backup-all.sh"
        "scripts/validate-setup.sh"
        "examples/multi-instance-example.sh"
        "docker-entrypoint.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [ -f "$script" ]; then
            if [ -x "$script" ]; then
                print_success "Executable: $script"
            else
                print_warning "Not executable: $script (run: chmod +x $script)"
            fi
        else
            print_error "Missing: $script"
        fi
    done
    
    echo
}

check_ports() {
    print_header "Checking Port Availability"
    
    local ports=(5000 5001 5002 5432 5433 5434)
    
    for port in "${ports[@]}"; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            print_warning "Port $port is in use"
        else
            print_success "Port $port is available"
        fi
    done
    
    echo
}

check_docker_network() {
    print_header "Checking Docker Network"
    
    # Test Docker network creation
    local test_network="zinto-test-network"
    
    if docker network create "$test_network" &> /dev/null; then
        print_success "Docker network creation works"
        docker network rm "$test_network" &> /dev/null
    else
        print_error "Cannot create Docker networks"
    fi
    
    echo
}

check_template_files() {
    print_header "Checking Template Files"
    
    # Check docker-compose template
    if [ -f "docker-compose.template.yml" ]; then
        if grep -q "\${INSTANCE_NAME}" "docker-compose.template.yml"; then
            print_success "Docker Compose template has variable substitution"
        else
            print_error "Docker Compose template missing variable substitution"
        fi
    fi
    
    # Check .env template
    if [ -f ".env.template" ]; then
        local required_vars=(
            "INSTANCE_NAME"
            "APP_PORT"
            "DB_PORT"
            "DB_NAME"
            "SESSION_SECRET"
            "COMPANY_NAME"
        )
        
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" ".env.template"; then
                print_success "Environment template has: $var"
            else
                print_error "Environment template missing: $var"
            fi
        done
    fi
    
    echo
}

test_deployment_script() {
    print_header "Testing Deployment Script"
    
    # Test script help
    if ./scripts/deploy-instance.sh --help &> /dev/null; then
        print_success "Deploy script help works"
    else
        print_error "Deploy script help failed"
    fi
    
    # Test management script help
    if ./scripts/manage-instance.sh --help &> /dev/null; then
        print_success "Management script help works"
    else
        print_error "Management script help failed"
    fi
    
    echo
}

show_summary() {
    print_header "Validation Summary"
    
    echo "Multi-instance deployment setup validation completed."
    echo
    echo -e "${GREEN}Next Steps:${NC}"
    echo "1. Run quick setup: ./scripts/quick-setup.sh"
    echo "2. Or deploy manually: ./scripts/deploy-instance.sh mycompany"
    echo "3. Monitor instances: ./scripts/monitor-resources.sh"
    echo "4. Read documentation: MULTI_INSTANCE_DEPLOYMENT.md"
    echo
    echo -e "${BLUE}Example Commands:${NC}"
    echo "  ./scripts/quick-setup.sh"
    echo "  ./scripts/deploy-instance.sh company1 --company-name 'My Company'"
    echo "  ./scripts/manage-instance.sh - list"
    echo "  ./scripts/monitor-resources.sh --watch"
    echo
}

# Main validation
main() {
    echo -e "${GREEN}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════════╗
║           Zinto Multi-Instance Validation            ║
║                                                               ║
║  This script validates your multi-instance deployment        ║
║  setup and checks for any issues.                            ║
╚═══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    
    local validation_failed=false
    
    check_prerequisites || validation_failed=true
    check_files || validation_failed=true
    check_scripts || validation_failed=true
    check_ports || validation_failed=true
    check_docker_network || validation_failed=true
    check_template_files || validation_failed=true
    test_deployment_script || validation_failed=true
    
    if [ "$validation_failed" = "true" ]; then
        print_error "Validation completed with issues. Please fix the errors above."
        echo
        show_summary
        exit 1
    else
        print_success "All validations passed! Your multi-instance setup is ready."
        echo
        show_summary
        exit 0
    fi
}

# Run validation
main "$@"
