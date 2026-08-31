#!/bin/bash

# Zinto Quick Setup Script
# This script helps you quickly deploy your first instance

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

# Function to prompt for input with default
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    if [ -n "$default" ]; then
        echo -n "$prompt [$default]: "
    else
        echo -n "$prompt: "
    fi
    
    read -r input
    if [ -z "$input" ] && [ -n "$default" ]; then
        input="$default"
    fi
    
    eval "$var_name='$input'"
}

# Function to generate random password
generate_password() {
    openssl rand -base64 12 2>/dev/null | tr -d "=+/" | cut -c1-12
}

# Welcome message
cat << EOF
${GREEN}
╔═══════════════════════════════════════════════════════════════╗
║                    Zinto Quick Setup                  ║
║                                                               ║
║  This script will help you deploy your first Zinto   ║
║  instance with minimal configuration.                        ║
╚═══════════════════════════════════════════════════════════════╝
${NC}

EOF

# Check prerequisites
print_status "Checking prerequisites..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_success "Prerequisites check passed!"
echo

# Collect instance information
print_status "Let's configure your Zinto instance:"
echo

# Instance name
prompt_with_default "Instance name (alphanumeric, hyphens, underscores only)" "my-company" INSTANCE_NAME

# Company name
prompt_with_default "Company/Organization name" "My Company" COMPANY_NAME

# Admin email
prompt_with_default "Admin email address" "admin@${INSTANCE_NAME}.com" ADMIN_EMAIL

# Admin password
ADMIN_PASSWORD=$(generate_password)
prompt_with_default "Admin password" "$ADMIN_PASSWORD" ADMIN_PASSWORD

# Ports
prompt_with_default "Application port" "9000" APP_PORT
prompt_with_default "Database port" "5432" DB_PORT

echo
print_status "Configuration Summary:"
echo "  Instance Name: $INSTANCE_NAME"
echo "  Company Name: $COMPANY_NAME"
echo "  Admin Email: $ADMIN_EMAIL"
echo "  Admin Password: $ADMIN_PASSWORD"
echo "  Application Port: $APP_PORT"
echo "  Database Port: $DB_PORT"
echo

# Confirm deployment
echo -n "Deploy this instance? (Y/n): "
read -r confirm
if [[ $confirm =~ ^[Nn]$ ]]; then
    print_status "Deployment cancelled."
    exit 0
fi

# Make scripts executable
chmod +x "$SCRIPT_DIR/deploy-instance.sh"
chmod +x "$SCRIPT_DIR/manage-instance.sh"

# Deploy the instance
print_status "Deploying Zinto instance..."
echo

"$SCRIPT_DIR/deploy-instance.sh" "$INSTANCE_NAME" \
    --app-port "$APP_PORT" \
    --db-port "$DB_PORT" \
    --company-name "$COMPANY_NAME" \
    --admin-email "$ADMIN_EMAIL" \
    --admin-password "$ADMIN_PASSWORD"

# Show final instructions
cat << EOF

${GREEN}🎉 Zinto instance deployed successfully!${NC}

${BLUE}Access Information:${NC}
  Application URL: ${YELLOW}http://localhost:$APP_PORT${NC}
  Admin Email: ${YELLOW}$ADMIN_EMAIL${NC}
  Admin Password: ${YELLOW}$ADMIN_PASSWORD${NC}

${BLUE}Next Steps:${NC}
1. Wait 1-2 minutes for the application to fully start
2. Open ${YELLOW}http://localhost:$APP_PORT${NC} in your browser
3. Login with the admin credentials above
4. Configure your WhatsApp and other channels
5. Create your first chatbot flow

${BLUE}Management Commands:${NC}
  View status:    ${YELLOW}./scripts/manage-instance.sh $INSTANCE_NAME status${NC}
  View logs:      ${YELLOW}./scripts/manage-instance.sh $INSTANCE_NAME logs${NC}
  Stop instance:  ${YELLOW}./scripts/manage-instance.sh $INSTANCE_NAME stop${NC}
  Start instance: ${YELLOW}./scripts/manage-instance.sh $INSTANCE_NAME start${NC}
  List all:       ${YELLOW}./scripts/manage-instance.sh - list${NC}

${BLUE}Deploy Additional Instances:${NC}
  ${YELLOW}./scripts/deploy-instance.sh company2 --app-port 5001 --db-port 5433${NC}

${GREEN}Happy chatting! 🚀${NC}

EOF
