#!/bin/bash

# Zinto Multi-Instance Management Script
# Usage: ./scripts/manage-instance.sh <instance_name> <command> [options]

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
Usage: $0 <instance_name> <command> [options]

Commands:
    start           Start the instance
    stop            Stop the instance
    restart         Restart the instance
    status          Show instance status
    logs            Show instance logs
    update          Update instance (rebuild containers)
    customize       Apply branding customization to running instance
    migrations      Manage database migrations (status, apply, etc.)
    remove          Remove instance completely
    backup          Create a backup of the instance
    restore         Restore instance from backup
    list            List all instances (ignores instance_name)
    shell           Open shell in app container
    db-shell        Open database shell

Options:
    --follow        Follow logs (for logs command)
    --force         Force operation without confirmation
    --backup-file   Specify backup file for restore

Examples:
    $0 company1 start
    $0 company1 logs --follow
    $0 company1 customize
    $0 company1 migrations status
    $0 company1 remove --force
    $0 - list
    $0 company1 backup
    $0 company1 restore --backup-file backup-20231201.sql

EOF
}

# Function to check if instance exists
instance_exists() {
    local instance_name=$1
    [ -d "$INSTANCES_DIR/$instance_name" ] && [ -f "$INSTANCES_DIR/$instance_name/.env" ]
}

# Function to get instance directory
get_instance_dir() {
    local instance_name=$1
    echo "$INSTANCES_DIR/$instance_name"
}

# Function to load instance environment
load_instance_env() {
    local instance_name=$1
    local instance_dir=$(get_instance_dir "$instance_name")

    if [ -f "$instance_dir/.env" ]; then
        export $(cat "$instance_dir/.env" | grep -v '^#' | xargs)
    fi
}

# Function to run docker-compose command
run_docker_compose() {
    local instance_name=$1
    local instance_dir=$(get_instance_dir "$instance_name")
    shift

    cd "$instance_dir"
    load_instance_env "$instance_name"
    docker-compose "$@"
}

# Command: Start instance
cmd_start() {
    local instance_name=$1

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    print_status "Starting instance '$instance_name'..."
    run_docker_compose "$instance_name" up -d
    print_success "Instance '$instance_name' started"
}

# Command: Stop instance
cmd_stop() {
    local instance_name=$1

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    print_status "Stopping instance '$instance_name'..."
    run_docker_compose "$instance_name" down
    print_success "Instance '$instance_name' stopped"
}

# Command: Restart instance
cmd_restart() {
    local instance_name=$1

    print_status "Restarting instance '$instance_name'..."
    cmd_stop "$instance_name"
    sleep 2
    cmd_start "$instance_name"
}

# Command: Show status
cmd_status() {
    local instance_name=$1

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    print_status "Status for instance '$instance_name':"
    run_docker_compose "$instance_name" ps

    # Show port information
    local instance_dir=$(get_instance_dir "$instance_name")
    if [ -f "$instance_dir/.env" ]; then
        local app_port=$(grep "^APP_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
        local db_port=$(grep "^DB_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
        echo
        print_status "Application URL: http://localhost:$app_port"
        print_status "Database port: $db_port"
    fi
}

# Command: Show logs
cmd_logs() {
    local instance_name=$1
    local follow_logs=$2

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    if [ "$follow_logs" = "true" ]; then
        run_docker_compose "$instance_name" logs -f
    else
        run_docker_compose "$instance_name" logs
    fi
}

# Command: Update instance
cmd_update() {
    local instance_name=$1

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    print_status "Updating instance '$instance_name'..."
    run_docker_compose "$instance_name" down
    run_docker_compose "$instance_name" build --no-cache
    run_docker_compose "$instance_name" up -d

    # Wait for containers to start
    sleep 10

    # Apply customization after update
    print_status "Applying branding customization..."
    if [ -f "$SCRIPT_DIR/customize-instance.sh" ]; then
        chmod +x "$SCRIPT_DIR/customize-instance.sh"
        if "$SCRIPT_DIR/customize-instance.sh" "$instance_name"; then
            print_success "Customization applied"
        else
            print_warning "Customization failed"
        fi
    fi

    print_success "Instance '$instance_name' updated"
}

# Command: Customize instance
cmd_customize() {
    local instance_name=$1

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    print_status "Customizing instance '$instance_name'..."

    if [ -f "$SCRIPT_DIR/customize-instance.sh" ]; then
        chmod +x "$SCRIPT_DIR/customize-instance.sh"
        if "$SCRIPT_DIR/customize-instance.sh" "$instance_name"; then
            print_success "Instance '$instance_name' customized successfully"
        else
            print_error "Customization failed for instance '$instance_name'"
            exit 1
        fi
    else
        print_error "Customization script not found: $SCRIPT_DIR/customize-instance.sh"
        exit 1
    fi
}

# Command: Manage migrations
cmd_migrations() {
    local instance_name=$1
    shift
    local migration_command="$1"
    shift

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    if [ -z "$migration_command" ]; then
        migration_command="status"
    fi

    print_status "Managing migrations for instance '$instance_name'..."

    if [ -f "$SCRIPT_DIR/manage-migrations.sh" ]; then
        chmod +x "$SCRIPT_DIR/manage-migrations.sh"
        "$SCRIPT_DIR/manage-migrations.sh" "$instance_name" "$migration_command" "$@"
    else
        print_error "Migration management script not found: $SCRIPT_DIR/manage-migrations.sh"
        exit 1
    fi
}

# Command: Remove instance
cmd_remove() {
    local instance_name=$1
    local force=$2

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    if [ "$force" != "true" ]; then
        echo -n "Are you sure you want to remove instance '$instance_name'? This will delete all data! (y/N): "
        read -r confirmation
        if [[ ! $confirmation =~ ^[Yy]$ ]]; then
            print_status "Operation cancelled"
            exit 0
        fi
    fi

    print_status "Removing instance '$instance_name'..."

    # Stop and remove containers
    run_docker_compose "$instance_name" down -v --remove-orphans

    # Remove Docker volumes
    docker volume rm "${instance_name}_postgres_data" 2>/dev/null || true
    docker volume rm "${instance_name}_uploads" 2>/dev/null || true
    docker volume rm "${instance_name}_whatsapp_sessions" 2>/dev/null || true
    docker volume rm "${instance_name}_backups" 2>/dev/null || true
    docker volume rm "${instance_name}_logs" 2>/dev/null || true

    # Remove Docker network
    docker network rm "${instance_name}_network" 2>/dev/null || true

    # Remove instance directory
    rm -rf "$(get_instance_dir "$instance_name")"

    print_success "Instance '$instance_name' removed completely"
}

# Command: List instances
cmd_list() {
    print_status "Zinto Instances:"
    echo

    if [ ! -d "$INSTANCES_DIR" ] || [ -z "$(ls -A "$INSTANCES_DIR" 2>/dev/null)" ]; then
        print_warning "No instances found"
        return
    fi

    printf "%-20s %-10s %-10s %-15s %-10s\n" "INSTANCE" "APP_PORT" "DB_PORT" "STATUS" "COMPANY"
    printf "%-20s %-10s %-10s %-15s %-10s\n" "--------" "--------" "-------" "------" "-------"

    for instance_dir in "$INSTANCES_DIR"/*; do
        if [ -d "$instance_dir" ] && [ -f "$instance_dir/.env" ]; then
            local instance_name=$(basename "$instance_dir")
            local app_port=$(grep "^APP_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
            local db_port=$(grep "^DB_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
            local company_name=$(grep "^COMPANY_NAME=" "$instance_dir/.env" | cut -d'=' -f2)

            # Check if containers are running
            cd "$instance_dir"
            load_instance_env "$instance_name"
            local status="stopped"
            if docker-compose ps -q | xargs docker inspect -f '{{.State.Running}}' 2>/dev/null | grep -q true; then
                status="running"
            fi

            printf "%-20s %-10s %-10s %-15s %-10s\n" "$instance_name" "$app_port" "$db_port" "$status" "$company_name"
        fi
    done
}

# Command: Open shell
cmd_shell() {
    local instance_name=$1

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    print_status "Opening shell in '$instance_name' app container..."
    run_docker_compose "$instance_name" exec app /bin/bash
}

# Command: Open database shell
cmd_db_shell() {
    local instance_name=$1

    if ! instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' does not exist"
        exit 1
    fi

    print_status "Opening database shell for '$instance_name'..."
    run_docker_compose "$instance_name" exec postgres psql -U postgres
}

# Parse command line arguments
INSTANCE_NAME=""
COMMAND=""
FOLLOW_LOGS=false
FORCE=false
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --follow)
            FOLLOW_LOGS=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --backup-file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --help)
            show_usage
            exit 0
            ;;
        -*)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            if [ -z "$INSTANCE_NAME" ]; then
                INSTANCE_NAME="$1"
            elif [ -z "$COMMAND" ]; then
                COMMAND="$1"
            else
                print_error "Too many arguments"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Special case for list command
if [ "$INSTANCE_NAME" = "-" ] && [ "$COMMAND" = "list" ]; then
    cmd_list
    exit 0
elif [ "$COMMAND" = "list" ]; then
    cmd_list
    exit 0
fi

# Check if instance name and command are provided
if [ -z "$INSTANCE_NAME" ] || [ -z "$COMMAND" ]; then
    print_error "Instance name and command are required"
    show_usage
    exit 1
fi

# Execute command
case $COMMAND in
    start)
        cmd_start "$INSTANCE_NAME"
        ;;
    stop)
        cmd_stop "$INSTANCE_NAME"
        ;;
    restart)
        cmd_restart "$INSTANCE_NAME"
        ;;
    status)
        cmd_status "$INSTANCE_NAME"
        ;;
    logs)
        cmd_logs "$INSTANCE_NAME" "$FOLLOW_LOGS"
        ;;
    update)
        cmd_update "$INSTANCE_NAME"
        ;;
    customize)
        cmd_customize "$INSTANCE_NAME"
        ;;
    migrations)
        cmd_migrations "$INSTANCE_NAME" "$@"
        ;;
    remove)
        cmd_remove "$INSTANCE_NAME" "$FORCE"
        ;;
    shell)
        cmd_shell "$INSTANCE_NAME"
        ;;
    db-shell)
        cmd_db_shell "$INSTANCE_NAME"
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_usage
        exit 1
        ;;
esac
