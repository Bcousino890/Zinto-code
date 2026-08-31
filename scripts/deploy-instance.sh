#!/bin/bash

# Zinto Multi-Instance Deployment Script
# Usage: ./scripts/deploy-instance.sh <instance_name> [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
INSTANCES_DIR="$PROJECT_ROOT/instances"
DEFAULT_APP_PORT=9000
DEFAULT_DB_PORT=5432

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
Usage: $0 <instance_name> [options]

Options:
    --app-port PORT         Application port (default: auto-assigned starting from 9000)
    --db-port PORT          Database port (default: auto-assigned starting from 5432)
    --company-name NAME     Company name for the instance
    --admin-email EMAIL     Admin email address
    --admin-password PASS   Admin password
    --help                  Show this help message

Examples:
    $0 company1
    $0 company2 --app-port 5001 --db-port 5433 --company-name "Company Two"
    $0 demo --company-name "Demo Company" --admin-email admin@demo.com

EOF
}

# Function to find next available port
find_next_port() {
    local start_port=$1
    local port=$start_port

    while netstat -tuln 2>/dev/null | grep -q ":$port "; do
        ((port++))
    done

    echo $port
}

# Function to generate random string
generate_random_string() {
    local length=${1:-32}
    openssl rand -hex $length 2>/dev/null || head -c $length /dev/urandom | xxd -p | tr -d '\n'
}

# Function to validate instance name
validate_instance_name() {
    local name=$1
    if [[ ! $name =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]]; then
        print_error "Instance name must start with alphanumeric character and contain only letters, numbers, hyphens, and underscores"
        exit 1
    fi
}

# Function to check if instance exists
instance_exists() {
    local instance_name=$1
    [ -f "$INSTANCES_DIR/$instance_name/.env" ]
}

# Function to create instance directory structure
create_instance_structure() {
    local instance_name=$1
    local instance_dir="$INSTANCES_DIR/$instance_name"

    print_status "Creating instance directory structure..."

    mkdir -p "$instance_dir"/{config,logs,data/{uploads,whatsapp-sessions,backups}}

    print_success "Instance directory structure created at $instance_dir"
}

# Function to create docker-compose file
create_docker_compose() {
    local instance_name=$1
    local app_port=$2
    local db_port=$3
    local instance_dir="$INSTANCES_DIR/$instance_name"

    print_status "Creating Docker Compose configuration..."

    # Load environment variables from the .env file
    if [ -f "$instance_dir/.env" ]; then
        # Clean line endings and export all variables from .env file
        sed -i 's/\r$//' "$instance_dir/.env" 2>/dev/null || true
        set -a
        source "$instance_dir/.env"
        set +a
    fi

    # Set core environment variables for substitution
    export INSTANCE_NAME="$instance_name"
    export APP_PORT="$app_port"
    export DB_PORT="$db_port"
    export DB_NAME="zinto_${instance_name}"
    export DB_USER="${DB_USER:-postgres}"
    export DB_PASSWORD="${DB_PASSWORD:-root}"
    export NODE_ENV="${NODE_ENV:-production}"

    # Create docker-compose.yml from template
    envsubst < "$PROJECT_ROOT/docker-compose.template.yml" > "$instance_dir/docker-compose.yml"

    print_success "Docker Compose file created"
}

# Function to create environment file
create_env_file() {
    local instance_name=$1
    local app_port=$2
    local db_port=$3
    local company_name=$4
    local admin_email=$5
    local admin_password=$6

    local instance_dir="$INSTANCES_DIR/$instance_name"
    local env_file="$instance_dir/.env"

    print_status "Creating environment configuration..."

    # Copy template and customize
    cp "$PROJECT_ROOT/.env.template" "$env_file"

    # Generate unique session secret
    local session_secret=$(generate_random_string 64)

    # Replace values in env file
    sed -i "s/INSTANCE_NAME=.*/INSTANCE_NAME=$instance_name/" "$env_file"
    sed -i "s/APP_PORT=.*/APP_PORT=$app_port/" "$env_file"
    sed -i "s/DB_PORT=.*/DB_PORT=$db_port/" "$env_file"
    sed -i "s/DB_NAME=.*/DB_NAME=zinto_${instance_name}/" "$env_file"
    sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$session_secret/" "$env_file"

    if [ -n "$company_name" ]; then
        sed -i "s/COMPANY_NAME=.*/COMPANY_NAME=$company_name/" "$env_file"
        # Create slug from company name
        local company_slug=$(echo "$company_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g')
        sed -i "s/COMPANY_SLUG=.*/COMPANY_SLUG=$company_slug/" "$env_file"
    fi

    if [ -n "$admin_email" ]; then
        sed -i "s/ADMIN_EMAIL=.*/ADMIN_EMAIL=$admin_email/" "$env_file"
    fi

    if [ -n "$admin_password" ]; then
        sed -i "s/ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$admin_password/" "$env_file"
    fi

    print_success "Environment file created at $env_file"
}

# Main deployment function
deploy_instance() {
    local instance_name=$1
    local app_port=$2
    local db_port=$3
    local company_name=$4
    local admin_email=$5
    local admin_password=$6

    print_status "Deploying Zinto instance: $instance_name"

    # Validate instance name
    validate_instance_name "$instance_name"

    # Check if instance already exists
    if instance_exists "$instance_name"; then
        print_error "Instance '$instance_name' already exists!"
        print_status "Use './scripts/manage-instance.sh $instance_name update' to update an existing instance"
        exit 1
    fi

    # Auto-assign ports if not specified
    if [ -z "$app_port" ]; then
        app_port=$(find_next_port $DEFAULT_APP_PORT)
        print_status "Auto-assigned application port: $app_port"
    fi

    if [ -z "$db_port" ]; then
        db_port=$(find_next_port $DEFAULT_DB_PORT)
        print_status "Auto-assigned database port: $db_port"
    fi

    # Create instance structure
    create_instance_structure "$instance_name"

    # Create environment file
    create_env_file "$instance_name" "$app_port" "$db_port" "$company_name" "$admin_email" "$admin_password"

    # Create docker-compose file
    create_docker_compose "$instance_name" "$app_port" "$db_port"

    # Customize migration files before deployment
    print_status "Customizing database migrations..."
    if [ -f "$SCRIPT_DIR/customize-migration.sh" ]; then
        chmod +x "$SCRIPT_DIR/customize-migration.sh"
        if "$SCRIPT_DIR/customize-migration.sh" "$instance_name"; then
            print_success "Migration customization completed"
        else
            print_error "Migration customization failed"
            exit 1
        fi
    else
        print_error "Migration customization script not found: $SCRIPT_DIR/customize-migration.sh"
        exit 1
    fi

    # Deploy the instance
    local instance_dir="$INSTANCES_DIR/$instance_name"

    print_status "Starting Docker containers..."
    cd "$instance_dir"

    # Build and start containers (environment variables are loaded from .env automatically)
    docker-compose up -d --build

    # Wait for containers to be ready
    print_status "Waiting for containers to start..."
    sleep 10

    # Perform instance customization (string replacements)
    print_status "Customizing instance with branding..."
    if [ -f "$SCRIPT_DIR/customize-instance.sh" ]; then
        chmod +x "$SCRIPT_DIR/customize-instance.sh"
        if "$SCRIPT_DIR/customize-instance.sh" "$instance_name"; then
            print_success "Instance customization completed"
        else
            print_warning "Instance customization failed, but deployment continued"
        fi
    else
        print_warning "Customization script not found, skipping branding customization"
    fi

    print_success "Instance '$instance_name' deployed successfully!"
    print_status "Application URL: http://localhost:$app_port"
    print_status "Database port: $db_port"
    print_status "Instance directory: $instance_dir"

    # Show next steps
    cat << EOF

${GREEN}Next Steps:${NC}
1. Wait for the containers to fully start (may take 1-2 minutes)
2. Access the application at: ${BLUE}http://localhost:$app_port${NC}
3. Login with admin credentials from the .env file
4. Configure your channels and flows

${YELLOW}Management Commands:${NC}
- View logs: ./scripts/manage-instance.sh $instance_name logs
- Stop instance: ./scripts/manage-instance.sh $instance_name stop
- Start instance: ./scripts/manage-instance.sh $instance_name start
- Remove instance: ./scripts/manage-instance.sh $instance_name remove

EOF
}

# Parse command line arguments
INSTANCE_NAME=""
APP_PORT=""
DB_PORT=""
COMPANY_NAME=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --app-port)
            APP_PORT="$2"
            shift 2
            ;;
        --db-port)
            DB_PORT="$2"
            shift 2
            ;;
        --company-name)
            COMPANY_NAME="$2"
            shift 2
            ;;
        --admin-email)
            ADMIN_EMAIL="$2"
            shift 2
            ;;
        --admin-password)
            ADMIN_PASSWORD="$2"
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
            else
                print_error "Multiple instance names provided"
                show_usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Check if instance name is provided
if [ -z "$INSTANCE_NAME" ]; then
    print_error "Instance name is required"
    show_usage
    exit 1
fi

# Create instances directory if it doesn't exist
mkdir -p "$INSTANCES_DIR"

# Deploy the instance
deploy_instance "$INSTANCE_NAME" "$APP_PORT" "$DB_PORT" "$COMPANY_NAME" "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
