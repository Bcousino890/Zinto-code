#!/bin/bash

# BotHivePlus Migration Management Script
# This script manages database migrations for instances with execution tracking
# Usage: ./scripts/manage-migrations.sh <instance_name> <command>

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
Usage: $0 <instance_name> <command>

Commands:
    status      Show migration status for the instance
    apply       Apply pending migrations
    mark-applied Mark a migration as applied without running it
    reset       Reset migration status (mark all as pending)
    list        List all available migrations

Arguments:
    instance_name    Name of the instance

Examples:
    $0 cbl status
    $0 cbl apply
    $0 cbl mark-applied 001-initial-schema.sql
    $0 cbl reset

EOF
}

# Function to get migration status file
get_migration_status_file() {
    local instance_name=$1
    echo "$INSTANCES_DIR/$instance_name/.migration_status"
}

# Function to check if migration has been applied
is_migration_applied() {
    local instance_name=$1
    local migration_file=$2
    local status_file=$(get_migration_status_file "$instance_name")

    if [ ! -f "$status_file" ]; then
        return 1  # Not applied if status file doesn't exist
    fi

    local status=$(grep "^${migration_file}:" "$status_file" | cut -d':' -f2)
    [ "$status" = "applied" ]
}

# Function to update migration status
update_migration_status() {
    local instance_name=$1
    local migration_file=$2
    local new_status=$3
    local status_file=$(get_migration_status_file "$instance_name")

    if [ ! -f "$status_file" ]; then
        print_error "Migration status file not found: $status_file"
        return 1
    fi

    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Update or add the migration status
    if grep -q "^${migration_file}:" "$status_file"; then
        # Update existing entry
        sed -i "s/^${migration_file}:.*/${migration_file}:${new_status}:${timestamp}/" "$status_file"
    else
        # Add new entry
        echo "${migration_file}:${new_status}:${timestamp}" >> "$status_file"
    fi

    print_status "Updated migration status: $migration_file -> $new_status"
}

# Function to execute migration in container
execute_migration() {
    local instance_name=$1
    local migration_file=$2
    local container_name="${instance_name}-postgres"

    print_status "Executing migration: $migration_file"

    # Check if container is running
    if ! docker ps --format "{{.Names}}" | grep -q "^${container_name}$"; then
        print_error "Database container '$container_name' is not running"
        return 1
    fi

    # Get database connection details
    local instance_dir="$INSTANCES_DIR/$instance_name"
    if [ ! -f "$instance_dir/.env" ]; then
        print_error "Instance .env file not found: $instance_dir/.env"
        return 1
    fi

    # Load environment variables
    set -a
    source "$instance_dir/.env"
    set +a

    # Execute migration
    local migration_path="/app/migrations/$migration_file"

    if docker exec "$container_name" psql -h postgres -p 5432 -U "${DB_USER:-postgres}" -d "${DB_NAME}" -f "$migration_path"; then
        print_success "Migration executed successfully: $migration_file"
        update_migration_status "$instance_name" "$migration_file" "applied"
        return 0
    else
        print_error "Migration failed: $migration_file"
        update_migration_status "$instance_name" "$migration_file" "failed"
        return 1
    fi
}

# Command: Show migration status
cmd_status() {
    local instance_name=$1
    local status_file=$(get_migration_status_file "$instance_name")

    print_status "Migration status for instance: $instance_name"

    if [ ! -f "$status_file" ]; then
        print_warning "No migration status file found. Run migration customization first."
        return 1
    fi

    echo
    printf "%-30s %-10s %-20s\n" "MIGRATION" "STATUS" "TIMESTAMP"
    printf "%-30s %-10s %-20s\n" "---------" "------" "---------"

    while IFS=':' read -r migration status timestamp; do
        # Skip comments and empty lines
        if [[ "$migration" =~ ^#.*$ ]] || [ -z "$migration" ]; then
            continue
        fi

        case "$status" in
            "applied")
                printf "%-30s ${GREEN}%-10s${NC} %-20s\n" "$migration" "$status" "$timestamp"
                ;;
            "failed")
                printf "%-30s ${RED}%-10s${NC} %-20s\n" "$migration" "$status" "$timestamp"
                ;;
            "pending")
                printf "%-30s ${YELLOW}%-10s${NC} %-20s\n" "$migration" "$status" "$timestamp"
                ;;
            *)
                printf "%-30s %-10s %-20s\n" "$migration" "$status" "$timestamp"
                ;;
        esac
    done < "$status_file"

    echo
}

# Command: Apply pending migrations
cmd_apply() {
    local instance_name=$1
    local status_file=$(get_migration_status_file "$instance_name")

    print_status "Applying pending migrations for instance: $instance_name"

    if [ ! -f "$status_file" ]; then
        print_error "No migration status file found. Run migration customization first."
        return 1
    fi

    local applied_count=0
    local failed_count=0

    while IFS=':' read -r migration status timestamp; do
        # Skip comments and empty lines
        if [[ "$migration" =~ ^#.*$ ]] || [ -z "$migration" ]; then
            continue
        fi

        if [ "$status" = "pending" ]; then
            if execute_migration "$instance_name" "$migration"; then
                ((applied_count++))
            else
                ((failed_count++))
            fi
        fi
    done < "$status_file"

    echo
    print_status "Migration summary:"
    print_status "  Applied: $applied_count"
    if [ $failed_count -gt 0 ]; then
        print_warning "  Failed: $failed_count"
    else
        print_status "  Failed: $failed_count"
    fi

    if [ $failed_count -eq 0 ]; then
        print_success "All pending migrations applied successfully"
    else
        print_error "Some migrations failed. Check the logs above."
        return 1
    fi
}

# Command: Mark migration as applied
cmd_mark_applied() {
    local instance_name=$1
    local migration_file=$2

    if [ -z "$migration_file" ]; then
        print_error "Migration file name is required"
        show_usage
        return 1
    fi

    print_status "Marking migration as applied: $migration_file"
    update_migration_status "$instance_name" "$migration_file" "applied"
    print_success "Migration marked as applied: $migration_file"
}

# Command: Reset migration status
cmd_reset() {
    local instance_name=$1
    local status_file=$(get_migration_status_file "$instance_name")

    print_warning "This will reset all migration statuses to 'pending'"
    echo -n "Are you sure? (y/N): "
    read -r confirmation

    if [[ ! $confirmation =~ ^[Yy]$ ]]; then
        print_status "Operation cancelled"
        return 0
    fi

    if [ ! -f "$status_file" ]; then
        print_error "No migration status file found"
        return 1
    fi

    # Reset all statuses to pending
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    while IFS=':' read -r migration status old_timestamp; do
        # Skip comments and empty lines
        if [[ "$migration" =~ ^#.*$ ]] || [ -z "$migration" ]; then
            continue
        fi

        sed -i "s/^${migration}:.*/${migration}:pending:${timestamp}/" "$status_file"
    done < "$status_file"

    print_success "All migration statuses reset to pending"
}

# Command: List migrations
cmd_list() {
    local instance_name=$1
    local instance_dir="$INSTANCES_DIR/$instance_name"
    local migrations_dir="$instance_dir/migrations"

    print_status "Available migrations for instance: $instance_name"

    if [ ! -d "$migrations_dir" ]; then
        print_warning "No migrations directory found: $migrations_dir"
        print_status "Run migration customization first: ./scripts/customize-migration.sh $instance_name"
        return 1
    fi

    echo
    printf "%-30s %-10s\n" "MIGRATION FILE" "SIZE"
    printf "%-30s %-10s\n" "--------------" "----"

    for migration_file in "$migrations_dir"/*.sql; do
        if [ -f "$migration_file" ]; then
            local filename=$(basename "$migration_file")
            local size=$(du -h "$migration_file" | cut -f1)
            printf "%-30s %-10s\n" "$filename" "$size"
        fi
    done

    echo
}

# Parse command line arguments
if [ $# -lt 2 ]; then
    print_error "Instance name and command are required"
    show_usage
    exit 1
fi

INSTANCE_NAME="$1"
COMMAND="$2"
shift 2

# Validate instance
if [ ! -d "$INSTANCES_DIR/$INSTANCE_NAME" ]; then
    print_error "Instance '$INSTANCE_NAME' does not exist"
    exit 1
fi

# Execute command
case $COMMAND in
    status)
        cmd_status "$INSTANCE_NAME"
        ;;
    apply)
        cmd_apply "$INSTANCE_NAME"
        ;;
    mark-applied)
        cmd_mark_applied "$INSTANCE_NAME" "$1"
        ;;
    reset)
        cmd_reset "$INSTANCE_NAME"
        ;;
    list)
        cmd_list "$INSTANCE_NAME"
        ;;
    --help|-h)
        show_usage
        exit 0
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac
