#!/bin/bash

# BotHivePlus Resource Monitoring Script
# Usage: ./scripts/monitor-resources.sh [instance_name] [--watch]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTANCES_DIR="$PROJECT_ROOT/instances"

# Function to print colored output
print_header() {
    echo -e "${CYAN}$1${NC}"
}

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to format bytes
format_bytes() {
    local bytes=$1
    if [ $bytes -gt 1073741824 ]; then
        echo "$(echo "scale=2; $bytes/1073741824" | bc)GB"
    elif [ $bytes -gt 1048576 ]; then
        echo "$(echo "scale=2; $bytes/1048576" | bc)MB"
    elif [ $bytes -gt 1024 ]; then
        echo "$(echo "scale=2; $bytes/1024" | bc)KB"
    else
        echo "${bytes}B"
    fi
}

# Function to get container stats
get_container_stats() {
    local container_name=$1
    
    if ! docker ps --format "table {{.Names}}" | grep -q "^${container_name}$"; then
        echo "stopped"
        return
    fi
    
    # Get container stats (CPU, Memory, Network, Block I/O)
    docker stats --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" "$container_name" | tail -n 1
}

# Function to get volume size
get_volume_size() {
    local volume_name=$1
    
    if docker volume ls --format "{{.Name}}" | grep -q "^${volume_name}$"; then
        local size=$(docker run --rm -v "${volume_name}:/data" alpine du -sb /data 2>/dev/null | cut -f1)
        if [ -n "$size" ]; then
            format_bytes "$size"
        else
            "N/A"
        fi
    else
        echo "N/A"
    fi
}

# Function to monitor single instance
monitor_instance() {
    local instance_name=$1
    local instance_dir="$INSTANCES_DIR/$instance_name"
    
    if [ ! -d "$instance_dir" ] || [ ! -f "$instance_dir/.env" ]; then
        print_error "Instance '$instance_name' does not exist"
        return 1
    fi
    
    # Load instance environment
    local app_port=$(grep "^APP_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
    local db_port=$(grep "^DB_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
    local company_name=$(grep "^COMPANY_NAME=" "$instance_dir/.env" | cut -d'=' -f2)
    
    print_header "=== Instance: $instance_name ($company_name) ==="
    
    # Container status and stats
    local app_container="${instance_name}-app"
    local db_container="${instance_name}-postgres"
    
    echo -e "${BLUE}Containers:${NC}"
    printf "  %-20s %-10s %-15s %-20s %-15s %-15s\n" "CONTAINER" "STATUS" "CPU" "MEMORY" "NETWORK" "DISK I/O"
    printf "  %-20s %-10s %-15s %-20s %-15s %-15s\n" "---------" "------" "---" "------" "-------" "--------"
    
    # App container
    local app_stats=$(get_container_stats "$app_container")
    if [ "$app_stats" = "stopped" ]; then
        printf "  %-20s %-10s %-15s %-20s %-15s %-15s\n" "$app_container" "stopped" "-" "-" "-" "-"
    else
        printf "  %-20s %-10s %s\n" "$app_container" "running" "$app_stats"
    fi
    
    # Database container
    local db_stats=$(get_container_stats "$db_container")
    if [ "$db_stats" = "stopped" ]; then
        printf "  %-20s %-10s %-15s %-20s %-15s %-15s\n" "$db_container" "stopped" "-" "-" "-" "-"
    else
        printf "  %-20s %-10s %s\n" "$db_container" "running" "$db_stats"
    fi
    
    echo
    
    # Volume usage
    echo -e "${BLUE}Storage Volumes:${NC}"
    printf "  %-30s %-15s\n" "VOLUME" "SIZE"
    printf "  %-30s %-15s\n" "------" "----"
    
    local volumes=("postgres_data" "uploads" "whatsapp_sessions" "backups" "logs")
    for vol in "${volumes[@]}"; do
        local volume_name="${instance_name}_${vol}"
        local size=$(get_volume_size "$volume_name")
        printf "  %-30s %-15s\n" "$volume_name" "$size"
    done
    
    echo
    
    # Port information
    echo -e "${BLUE}Network:${NC}"
    echo "  Application URL: http://localhost:$app_port"
    echo "  Database Port: $db_port"
    
    # Health check
    echo
    echo -e "${BLUE}Health Status:${NC}"
    if [ "$app_stats" != "stopped" ]; then
        if curl -s -f "http://localhost:$app_port/" > /dev/null 2>&1; then
            print_success "Application is healthy"
        else
            print_warning "Application health check failed"
        fi
    else
        print_error "Application is not running"
    fi
    
    echo
}

# Function to monitor all instances
monitor_all_instances() {
    print_header "BotHivePlus Multi-Instance Resource Monitor"
    echo "Generated at: $(date)"
    echo
    
    # System overview
    print_header "=== System Overview ==="
    echo -e "${BLUE}Docker System:${NC}"
    docker system df
    echo
    
    echo -e "${BLUE}System Resources:${NC}"
    echo "  CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
    echo "  Memory: $(free -h | awk 'NR==2{printf "%.1f/%.1fGB (%.1f%%)", $3/1024/1024, $2/1024/1024, $3*100/$2}')"
    echo "  Disk: $(df -h / | awk 'NR==2{printf "%s/%s (%s)", $3, $2, $5}')"
    echo
    
    # Instance overview
    if [ ! -d "$INSTANCES_DIR" ] || [ -z "$(ls -A "$INSTANCES_DIR" 2>/dev/null)" ]; then
        print_warning "No instances found"
        return
    fi
    
    print_header "=== Instance Summary ==="
    printf "%-20s %-10s %-10s %-15s %-20s\n" "INSTANCE" "APP_PORT" "STATUS" "CPU" "MEMORY"
    printf "%-20s %-10s %-10s %-15s %-20s\n" "--------" "--------" "------" "---" "------"
    
    for instance_dir in "$INSTANCES_DIR"/*; do
        if [ -d "$instance_dir" ] && [ -f "$instance_dir/.env" ]; then
            local instance_name=$(basename "$instance_dir")
            local app_port=$(grep "^APP_PORT=" "$instance_dir/.env" | cut -d'=' -f2)
            local app_container="${instance_name}-app"
            
            local status="stopped"
            local cpu="-"
            local memory="-"
            
            if docker ps --format "{{.Names}}" | grep -q "^${app_container}$"; then
                status="running"
                local stats=$(docker stats --no-stream --format "{{.CPUPerc}}\t{{.MemUsage}}" "$app_container" 2>/dev/null)
                if [ -n "$stats" ]; then
                    cpu=$(echo "$stats" | cut -f1)
                    memory=$(echo "$stats" | cut -f2)
                fi
            fi
            
            printf "%-20s %-10s %-10s %-15s %-20s\n" "$instance_name" "$app_port" "$status" "$cpu" "$memory"
        fi
    done
    
    echo
    
    # Detailed monitoring for each instance
    for instance_dir in "$INSTANCES_DIR"/*; do
        if [ -d "$instance_dir" ] && [ -f "$instance_dir/.env" ]; then
            local instance_name=$(basename "$instance_dir")
            monitor_instance "$instance_name"
        fi
    done
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [instance_name] [options]

Options:
    --watch         Continuous monitoring (refresh every 5 seconds)
    --help          Show this help message

Examples:
    $0                      # Monitor all instances
    $0 company1             # Monitor specific instance
    $0 --watch              # Continuous monitoring of all instances
    $0 company1 --watch     # Continuous monitoring of specific instance

EOF
}

# Parse command line arguments
INSTANCE_NAME=""
WATCH_MODE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --watch)
            WATCH_MODE=true
            shift
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
            else
                print_error "Multiple instance names provided"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Main execution
if [ "$WATCH_MODE" = "true" ]; then
    # Continuous monitoring
    while true; do
        clear
        if [ -n "$INSTANCE_NAME" ]; then
            monitor_instance "$INSTANCE_NAME"
        else
            monitor_all_instances
        fi
        echo
        print_status "Refreshing in 5 seconds... (Press Ctrl+C to stop)"
        sleep 5
    done
else
    # Single run
    if [ -n "$INSTANCE_NAME" ]; then
        monitor_instance "$INSTANCE_NAME"
    else
        monitor_all_instances
    fi
fi
