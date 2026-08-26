#!/bin/bash

# BotHivePlus Multi-Instance Backup Script
# Usage: ./scripts/backup-all.sh [options]

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
BACKUP_DIR="$PROJECT_ROOT/backups"

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
Usage: $0 [options]

Options:
    --config-only       Backup only configuration files (no database)
    --data-only         Backup only database data (no configuration)
    --compress          Compress backup files
    --output-dir DIR    Specify output directory (default: ./backups)
    --help              Show this help message

Examples:
    $0                          # Full backup of all instances
    $0 --config-only            # Backup only configuration files
    $0 --compress               # Create compressed backups
    $0 --output-dir /backup     # Backup to specific directory

EOF
}

# Function to create backup directory
create_backup_dir() {
    local backup_date=$(date +%Y%m%d_%H%M%S)
    local backup_path="$BACKUP_DIR/multi_instance_backup_$backup_date"
    
    mkdir -p "$backup_path"
    echo "$backup_path"
}

# Function to backup instance configuration
backup_instance_config() {
    local instance_name=$1
    local backup_path=$2
    local instance_dir="$INSTANCES_DIR/$instance_name"
    
    if [ ! -d "$instance_dir" ]; then
        print_warning "Instance directory not found: $instance_dir"
        return 1
    fi
    
    print_status "Backing up configuration for $instance_name..."
    
    # Create instance backup directory
    local instance_backup_dir="$backup_path/$instance_name"
    mkdir -p "$instance_backup_dir"
    
    # Copy configuration files
    cp "$instance_dir/.env" "$instance_backup_dir/" 2>/dev/null || print_warning "No .env file found for $instance_name"
    cp "$instance_dir/docker-compose.yml" "$instance_backup_dir/" 2>/dev/null || print_warning "No docker-compose.yml found for $instance_name"
    
    # Copy custom config directory if exists
    if [ -d "$instance_dir/config" ]; then
        cp -r "$instance_dir/config" "$instance_backup_dir/"
    fi
    
    print_success "Configuration backup completed for $instance_name"
}

# Function to backup instance database
backup_instance_database() {
    local instance_name=$1
    local backup_path=$2
    local instance_dir="$INSTANCES_DIR/$instance_name"
    
    if [ ! -f "$instance_dir/.env" ]; then
        print_warning "No .env file found for $instance_name"
        return 1
    fi
    
    # Load instance environment
    local db_name=$(grep "^DB_NAME=" "$instance_dir/.env" | cut -d'=' -f2)
    local db_user=$(grep "^DB_USER=" "$instance_dir/.env" | cut -d'=' -f2)
    local db_password=$(grep "^DB_PASSWORD=" "$instance_dir/.env" | cut -d'=' -f2)
    local db_port=$(grep "^DB_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
    
    # Check if database container is running
    local db_container="${instance_name}-postgres"
    if ! docker ps --format "{{.Names}}" | grep -q "^${db_container}$"; then
        print_warning "Database container not running for $instance_name"
        return 1
    fi
    
    print_status "Backing up database for $instance_name..."
    
    # Create database backup
    local backup_file="$backup_path/$instance_name/${instance_name}_database_$(date +%Y%m%d_%H%M%S).sql"
    
    # Use docker exec to run pg_dump
    if docker exec "$db_container" pg_dump -U "$db_user" -d "$db_name" > "$backup_file" 2>/dev/null; then
        print_success "Database backup completed for $instance_name: $(basename "$backup_file")"
    else
        print_error "Database backup failed for $instance_name"
        rm -f "$backup_file"
        return 1
    fi
}

# Function to backup instance volumes
backup_instance_volumes() {
    local instance_name=$1
    local backup_path=$2
    
    print_status "Backing up volumes for $instance_name..."
    
    local volumes=("uploads" "whatsapp_sessions" "backups")
    local volumes_backup_dir="$backup_path/$instance_name/volumes"
    mkdir -p "$volumes_backup_dir"
    
    for vol in "${volumes[@]}"; do
        local volume_name="${instance_name}_${vol}"
        
        if docker volume ls --format "{{.Name}}" | grep -q "^${volume_name}$"; then
            print_status "Backing up volume: $volume_name"
            
            # Create tar archive of volume
            local volume_backup="$volumes_backup_dir/${vol}.tar"
            
            if docker run --rm -v "${volume_name}:/data" -v "$volumes_backup_dir:/backup" alpine tar -cf "/backup/${vol}.tar" -C /data . 2>/dev/null; then
                print_success "Volume backup completed: $vol"
            else
                print_warning "Volume backup failed: $vol"
            fi
        else
            print_warning "Volume not found: $volume_name"
        fi
    done
}

# Function to backup single instance
backup_instance() {
    local instance_name=$1
    local backup_path=$2
    local config_only=$3
    local data_only=$4
    
    print_status "Starting backup for instance: $instance_name"
    
    if [ "$data_only" != "true" ]; then
        backup_instance_config "$instance_name" "$backup_path"
    fi
    
    if [ "$config_only" != "true" ]; then
        backup_instance_database "$instance_name" "$backup_path"
        backup_instance_volumes "$instance_name" "$backup_path"
    fi
    
    print_success "Backup completed for instance: $instance_name"
}

# Function to compress backup
compress_backup() {
    local backup_path=$1
    
    print_status "Compressing backup..."
    
    local backup_dir=$(dirname "$backup_path")
    local backup_name=$(basename "$backup_path")
    local compressed_file="${backup_path}.tar.gz"
    
    cd "$backup_dir"
    if tar -czf "${backup_name}.tar.gz" "$backup_name"; then
        rm -rf "$backup_name"
        print_success "Backup compressed: ${compressed_file}"
    else
        print_error "Compression failed"
        return 1
    fi
}

# Function to create backup manifest
create_backup_manifest() {
    local backup_path=$1
    local manifest_file="$backup_path/BACKUP_MANIFEST.txt"
    
    cat > "$manifest_file" << EOF
BotHivePlus Multi-Instance Backup
===================================

Backup Date: $(date)
Backup Path: $backup_path
Script Version: 1.0

Instances Backed Up:
EOF
    
    for instance_dir in "$backup_path"/*; do
        if [ -d "$instance_dir" ] && [ "$(basename "$instance_dir")" != "BACKUP_MANIFEST.txt" ]; then
            local instance_name=$(basename "$instance_dir")
            echo "  - $instance_name" >> "$manifest_file"
            
            # List backup contents
            echo "    Configuration:" >> "$manifest_file"
            [ -f "$instance_dir/.env" ] && echo "      ✓ .env" >> "$manifest_file"
            [ -f "$instance_dir/docker-compose.yml" ] && echo "      ✓ docker-compose.yml" >> "$manifest_file"
            [ -d "$instance_dir/config" ] && echo "      ✓ config/" >> "$manifest_file"
            
            echo "    Database:" >> "$manifest_file"
            local db_backup=$(find "$instance_dir" -name "*_database_*.sql" | head -1)
            if [ -n "$db_backup" ]; then
                echo "      ✓ $(basename "$db_backup")" >> "$manifest_file"
            else
                echo "      ✗ No database backup" >> "$manifest_file"
            fi
            
            echo "    Volumes:" >> "$manifest_file"
            if [ -d "$instance_dir/volumes" ]; then
                for vol_backup in "$instance_dir/volumes"/*.tar; do
                    if [ -f "$vol_backup" ]; then
                        echo "      ✓ $(basename "$vol_backup")" >> "$manifest_file"
                    fi
                done
            else
                echo "      ✗ No volume backups" >> "$manifest_file"
            fi
            echo >> "$manifest_file"
        fi
    done
    
    echo "Backup completed successfully!" >> "$manifest_file"
}

# Main backup function
main_backup() {
    local config_only=$1
    local data_only=$2
    local compress=$3
    local output_dir=$4
    
    # Set backup directory
    if [ -n "$output_dir" ]; then
        BACKUP_DIR="$output_dir"
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    local backup_path=$(create_backup_dir)
    
    print_status "Starting multi-instance backup..."
    print_status "Backup location: $backup_path"
    
    # Check if instances directory exists
    if [ ! -d "$INSTANCES_DIR" ] || [ -z "$(ls -A "$INSTANCES_DIR" 2>/dev/null)" ]; then
        print_error "No instances found in $INSTANCES_DIR"
        exit 1
    fi
    
    # Backup each instance
    local backup_count=0
    for instance_dir in "$INSTANCES_DIR"/*; do
        if [ -d "$instance_dir" ] && [ -f "$instance_dir/.env" ]; then
            local instance_name=$(basename "$instance_dir")
            backup_instance "$instance_name" "$backup_path" "$config_only" "$data_only"
            ((backup_count++))
        fi
    done
    
    if [ $backup_count -eq 0 ]; then
        print_error "No valid instances found to backup"
        rm -rf "$backup_path"
        exit 1
    fi
    
    # Create backup manifest
    create_backup_manifest "$backup_path"
    
    # Compress if requested
    if [ "$compress" = "true" ]; then
        compress_backup "$backup_path"
        backup_path="${backup_path}.tar.gz"
    fi
    
    print_success "Multi-instance backup completed!"
    print_status "Backup location: $backup_path"
    print_status "Instances backed up: $backup_count"
    
    # Show backup size
    if [ -f "$backup_path" ]; then
        local backup_size=$(du -h "$backup_path" | cut -f1)
        print_status "Backup size: $backup_size"
    elif [ -d "$backup_path" ]; then
        local backup_size=$(du -sh "$backup_path" | cut -f1)
        print_status "Backup size: $backup_size"
    fi
}

# Parse command line arguments
CONFIG_ONLY=false
DATA_ONLY=false
COMPRESS=false
OUTPUT_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --config-only)
            CONFIG_ONLY=true
            shift
            ;;
        --data-only)
            DATA_ONLY=true
            shift
            ;;
        --compress)
            COMPRESS=true
            shift
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
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
            print_error "Unexpected argument: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate arguments
if [ "$CONFIG_ONLY" = "true" ] && [ "$DATA_ONLY" = "true" ]; then
    print_error "Cannot use --config-only and --data-only together"
    exit 1
fi

# Run main backup
main_backup "$CONFIG_ONLY" "$DATA_ONLY" "$COMPRESS" "$OUTPUT_DIR"
