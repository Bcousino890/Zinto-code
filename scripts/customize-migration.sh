#!/bin/bash

# BotHivePlus Migration Customization Script
# This script customizes database migration files with instance-specific values
# Usage: ./scripts/customize-migration.sh <instance_name>

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
MIGRATIONS_DIR="$PROJECT_ROOT/migrations"

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
Usage: $0 <instance_name>

This script customizes database migration files with instance-specific values
before the database migration runs.

Arguments:
    instance_name    Name of the instance to customize migrations for

Customizations performed:
    admin@bothiveapp.net → ADMIN_EMAIL from .env
    BotHive              → COMPANY_NAME from .env

Examples:
    $0 cbl
    $0 company1

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
        print_warning "COMPANY_NAME not found in .env file, using default"
        COMPANY_NAME="BotHive"
    fi
    
    print_status "Loaded configuration:"
    print_status "  Admin Email: $ADMIN_EMAIL"
    print_status "  Company Name: $COMPANY_NAME"
    
    return 0
}

# Function to create instance-specific migration directory
create_migration_directory() {
    local instance_name=$1
    local instance_dir="$INSTANCES_DIR/$instance_name"
    local instance_migrations_dir="$instance_dir/migrations"
    
    # Create migrations directory for this instance
    mkdir -p "$instance_migrations_dir"
    
    print_status "Created instance migrations directory: $instance_migrations_dir"
    return 0
}

# Function to customize migration file
customize_migration_file() {
    local instance_name=$1
    local migration_file=$2
    local admin_email=$3
    local company_name=$4
    
    local instance_dir="$INSTANCES_DIR/$instance_name"
    local instance_migrations_dir="$instance_dir/migrations"
    local source_file="$MIGRATIONS_DIR/$migration_file"
    local target_file="$instance_migrations_dir/$migration_file"
    
    # Check if source migration file exists
    if [ ! -f "$source_file" ]; then
        print_error "Source migration file not found: $source_file"
        return 1
    fi
    
    print_status "Customizing migration file: $migration_file"
    
    # Copy original file to instance directory
    cp "$source_file" "$target_file"
    
    # Escape special characters for sed
    local escaped_admin_email=$(echo "$admin_email" | sed 's/[[\.*^$()+?{|]/\\&/g')
    local escaped_company_name=$(echo "$company_name" | sed 's/[[\.*^$()+?{|]/\\&/g')
    
    # Perform string replacements
    print_status "Replacing 'admin@bothiveapp.net' with '$admin_email'..."
    sed -i "s/admin@bothiveapp\\.net/${escaped_admin_email}/g" "$target_file"
    
    print_status "Replacing 'BotHive' with '$company_name'..."
    sed -i "s/BotHive/${escaped_company_name}/g" "$target_file"
    
    # Verify replacements
    local admin_placeholders=$(grep -c "admin@bothiveapp\.net" "$target_file" 2>/dev/null || echo "0")
    local company_placeholders=$(grep -c "BotHive" "$target_file" 2>/dev/null || echo "0")
    
    if [ "$admin_placeholders" -eq 0 ]; then
        print_success "✓ All admin email placeholders replaced"
    else
        print_warning "✗ $admin_placeholders admin email placeholders remain"
    fi
    
    if [ "$company_placeholders" -eq 0 ]; then
        print_success "✓ All company name placeholders replaced"
    else
        print_warning "✗ $company_placeholders company name placeholders remain"
    fi
    
    # Check for successful replacements
    local admin_customized=$(grep -c "$admin_email" "$target_file" 2>/dev/null || echo "0")
    local company_customized=$(grep -c "$company_name" "$target_file" 2>/dev/null || echo "0")
    
    if [ "$admin_customized" -gt 0 ]; then
        print_success "✓ Found customized admin email in migration"
    fi
    
    if [ "$company_customized" -gt 0 ]; then
        print_success "✓ Found customized company name in migration"
    fi
    
    print_success "Migration file customized: $target_file"
    return 0
}

# Function to customize all migration files
customize_all_migrations() {
    local instance_name=$1
    local admin_email=$2
    local company_name=$3
    
    print_status "Customizing all migration files for instance: $instance_name"
    
    # Create instance migrations directory
    create_migration_directory "$instance_name"
    
    # Find all .sql files in migrations directory
    local migration_count=0
    for migration_file in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration_file" ]; then
            local filename=$(basename "$migration_file")
            customize_migration_file "$instance_name" "$filename" "$admin_email" "$company_name"
            ((migration_count++))
        fi
    done
    
    if [ $migration_count -eq 0 ]; then
        print_warning "No migration files found in $MIGRATIONS_DIR"
        return 1
    fi
    
    print_success "Customized $migration_count migration files"
    return 0
}

# Function to create migration status tracking
create_migration_tracking() {
    local instance_name=$1
    local instance_dir="$INSTANCES_DIR/$instance_name"
    local migration_status_file="$instance_dir/.migration_status"
    
    # Create migration status file
    cat > "$migration_status_file" << EOF
# Migration Status for Instance: $instance_name
# This file tracks which migrations have been applied to prevent re-execution
# Format: migration_filename:status:timestamp

# Status values: pending, applied, failed
# Timestamp format: YYYY-MM-DD HH:MM:SS

EOF
    
    # Add all migration files as pending
    for migration_file in "$MIGRATIONS_DIR"/*.sql; do
        if [ -f "$migration_file" ]; then
            local filename=$(basename "$migration_file")
            echo "${filename}:pending:$(date '+%Y-%m-%d %H:%M:%S')" >> "$migration_status_file"
        fi
    done
    
    print_success "Created migration tracking file: $migration_status_file"
    return 0
}

# Main customization function
main_customize() {
    local instance_name=$1
    
    print_status "Starting migration customization for instance: $instance_name"
    
    # Validate instance
    if ! validate_instance "$instance_name"; then
        exit 1
    fi
    
    # Load instance environment
    if ! load_instance_env "$instance_name"; then
        exit 1
    fi
    
    # Customize all migration files
    if ! customize_all_migrations "$instance_name" "$ADMIN_EMAIL" "$COMPANY_NAME"; then
        exit 1
    fi
    
    # Create migration tracking
    create_migration_tracking "$instance_name"
    
    print_success "Migration customization completed for instance: $instance_name"
    print_status "Customized migrations directory: $INSTANCES_DIR/$instance_name/migrations"
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
        main_customize "$1"
        ;;
esac
