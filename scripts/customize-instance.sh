#!/bin/bash

# Zinto Instance Customization Script
# This script performs post-build string replacements for instance-specific branding
# Usage: ./scripts/customize-instance.sh <instance_name> [container_name]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTANCES_DIR="$PROJECT_ROOT/instances"

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

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 <instance_name> [container_name]

This script customizes a Zinto instance by replacing placeholder strings
with instance-specific values from the .env file.

Arguments:
    instance_name    Name of the instance to customize
    container_name   Optional: specific container name (default: {instance_name}-app)

Replacements performed:
    admin@zintoapp.net → ADMIN_EMAIL from .env
    Zinto              → COMPANY_NAME from .env

Examples:
    $0 cbl
    $0 company1 company1-app

EOF
}

# Function to validate instance
validate_instance() {
    local instance_name=$1
    local instance_dir="$INSTANCES_DIR/$instance_name"
    
    if [ ! -d "$instance_dir" ]; then
        print_error "Instance directory not found: $instance_dir"
        return 1
    fi
    
    if [ ! -f "$instance_dir/.env" ]; then
        print_error "Instance .env file not found: $instance_dir/.env"
        return 1
    fi
    
    return 0
}

# Function to load instance environment
load_instance_env() {
    local instance_name=$1
    local instance_dir="$INSTANCES_DIR/$instance_name"
    
    # Clean line endings and source environment
    sed -i 's/\r$//' "$instance_dir/.env" 2>/dev/null || true
    
    # Load environment variables
    set -a
    source "$instance_dir/.env"
    set +a
    
    # Validate required variables
    if [ -z "$ADMIN_EMAIL" ]; then
        print_error "ADMIN_EMAIL not found in .env file"
        return 1
    fi
    
    if [ -z "$COMPANY_NAME" ]; then
        print_error "COMPANY_NAME not found in .env file"
        return 1
    fi
    
    print_status "Loaded configuration:"
    print_status "  Admin Email: $ADMIN_EMAIL"
    print_status "  Company Name: $COMPANY_NAME"
    
    return 0
}

# Function to check if container is running
check_container() {
    local container_name=$1
    
    if ! docker ps --format "{{.Names}}" | grep -q "^${container_name}$"; then
        print_error "Container '$container_name' is not running"
        return 1
    fi
    
    return 0
}

# Function to perform string replacements in container
customize_container() {
    local container_name=$1
    local admin_email=$2
    local company_name=$3
    
    print_status "Performing string replacements in container '$container_name'..."
    
    # Escape special characters for sed
    local escaped_admin_email=$(echo "$admin_email" | sed 's/[[\.*^$()+?{|]/\\&/g')
    local escaped_company_name=$(echo "$company_name" | sed 's/[[\.*^$()+?{|]/\\&/g')
    
    # Define replacement commands
    local admin_email_replacement="s/admin@zintoapp\\.net/${escaped_admin_email}/g"
    local company_name_replacement="s/Zinto/${escaped_company_name}/g"
    
    print_status "Replacing 'admin@zintoapp.net' with '$admin_email'..."
    
    # Replace in server-side built files
    docker exec "$container_name" find /app/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec sed -i "$admin_email_replacement" {} \; 2>/dev/null || true
    
    # Replace in client-side built files
    docker exec "$container_name" find /app/client/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec sed -i "$admin_email_replacement" {} \; 2>/dev/null || true
    
    print_status "Replacing 'Zinto' with '$company_name'..."
    
    # Replace in server-side built files
    docker exec "$container_name" find /app/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec sed -i "$company_name_replacement" {} \; 2>/dev/null || true
    
    # Replace in client-side built files
    docker exec "$container_name" find /app/client/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec sed -i "$company_name_replacement" {} \; 2>/dev/null || true
    
    print_success "String replacements completed"
}

# Function to restart container services
restart_container_services() {
    local container_name=$1
    
    print_status "Restarting application services in container..."
    
    # Send SIGUSR2 to restart the Node.js application gracefully
    docker exec "$container_name" pkill -SIGUSR2 node 2>/dev/null || true
    
    # Wait a moment for the restart
    sleep 2
    
    # Check if the application is still running
    if docker exec "$container_name" pgrep node >/dev/null 2>&1; then
        print_success "Application services restarted successfully"
    else
        print_warning "Application may need manual restart. Consider restarting the container."
    fi
}

# Function to verify replacements
verify_replacements() {
    local container_name=$1
    local admin_email=$2
    local company_name=$3
    
    print_status "Verifying replacements..."
    
    # Check for remaining placeholder strings
    local remaining_admin_placeholders=$(docker exec "$container_name" find /app/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec grep -l "admin@zintoapp\.net" {} \; 2>/dev/null | wc -l)
    
    local remaining_company_placeholders=$(docker exec "$container_name" find /app/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec grep -l "Zinto" {} \; 2>/dev/null | wc -l)
    
    if [ "$remaining_admin_placeholders" -eq 0 ]; then
        print_success "All admin email placeholders replaced"
    else
        print_warning "$remaining_admin_placeholders files still contain 'admin@zintoapp.net'"
    fi
    
    if [ "$remaining_company_placeholders" -eq 0 ]; then
        print_success "All company name placeholders replaced"
    else
        print_warning "$remaining_company_placeholders files still contain 'Zinto'"
    fi
    
    # Check for successful replacements
    local admin_replacements=$(docker exec "$container_name" find /app/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec grep -l "$admin_email" {} \; 2>/dev/null | wc -l)
    
    local company_replacements=$(docker exec "$container_name" find /app/dist -type f \( -name "*.js" -o -name "*.html" -o -name "*.css" \) \
        -exec grep -l "$company_name" {} \; 2>/dev/null | wc -l)
    
    if [ "$admin_replacements" -gt 0 ]; then
        print_success "Found '$admin_email' in $admin_replacements files"
    fi
    
    if [ "$company_replacements" -gt 0 ]; then
        print_success "Found '$company_name' in $company_replacements files"
    fi
}

# Main customization function
main_customize() {
    local instance_name=$1
    local container_name=${2:-"${instance_name}-app"}
    
    print_status "Starting instance customization for '$instance_name'..."
    
    # Validate instance
    if ! validate_instance "$instance_name"; then
        exit 1
    fi
    
    # Load instance environment
    if ! load_instance_env "$instance_name"; then
        exit 1
    fi
    
    # Check container
    if ! check_container "$container_name"; then
        exit 1
    fi
    
    # Perform customization
    customize_container "$container_name" "$ADMIN_EMAIL" "$COMPANY_NAME"
    
    # Restart services
    restart_container_services "$container_name"
    
    # Verify replacements
    verify_replacements "$container_name" "$ADMIN_EMAIL" "$COMPANY_NAME"
    
    print_success "Instance customization completed for '$instance_name'"
    print_status "Container: $container_name"
    print_status "Admin Email: $ADMIN_EMAIL"
    print_status "Company Name: $COMPANY_NAME"
}

# Parse command line arguments
if [ $# -lt 1 ]; then
    print_error "Instance name is required"
    show_usage
    exit 1
fi

case "$1" in
    --help|-h)
        show_usage
        exit 0
        ;;
    *)
        main_customize "$@"
        ;;
esac
