#!/bin/bash

# Stellar Privacy Analytics - Schema Validation CLI Tool
# This tool allows providers to pre-validate data locally before submission

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
SCHEMA_FILE=""
DATA_FILE=""
CONTRACT_ADDRESS=""
NETWORK="testnet"

# Help function
show_help() {
    echo -e "${BLUE}Stellar Privacy Analytics - Schema Validation CLI${NC}"
    echo
    echo "Usage: $0 [OPTIONS]"
    echo
    echo "Options:"
    echo "  -s, --schema FILE        Path to schema JSON file"
    echo "  -d, --data FILE          Path to data JSON file"
    echo "  -c, --contract ADDRESS   Stellar contract address"
    echo "  -n, --network NETWORK    Stellar network (testnet|mainnet|local) [default: testnet]"
    echo "  -h, --help               Show this help message"
    echo
    echo "Examples:"
    echo "  $0 -s schema.json -d data.json -c GD5KJ..."
    echo "  $0 --schema customer_schema.json --data customer_data.json --contract GD5KJ... --network mainnet"
    echo
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--schema)
            SCHEMA_FILE="$2"
            shift 2
            ;;
        -d|--data)
            DATA_FILE="$2"
            shift 2
            ;;
        -c|--contract)
            CONTRACT_ADDRESS="$2"
            shift 2
            ;;
        -n|--network)
            NETWORK="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Validate required arguments
if [[ -z "$SCHEMA_FILE" ]]; then
    echo -e "${RED}Error: Schema file is required${NC}"
    show_help
    exit 1
fi

if [[ -z "$DATA_FILE" ]]; then
    echo -e "${RED}Error: Data file is required${NC}"
    show_help
    exit 1
fi

if [[ -z "$CONTRACT_ADDRESS" ]]; then
    echo -e "${RED}Error: Contract address is required${NC}"
    show_help
    exit 1
fi

# Check if files exist
if [[ ! -f "$SCHEMA_FILE" ]]; then
    echo -e "${RED}Error: Schema file '$SCHEMA_FILE' not found${NC}"
    exit 1
fi

if [[ ! -f "$DATA_FILE" ]]; then
    echo -e "${RED}Error: Data file '$DATA_FILE' not found${NC}"
    exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed. Please install jq to continue.${NC}"
    exit 1
fi

# Check if curl is available
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is required but not installed. Please install curl to continue.${NC}"
    exit 1
fi

echo -e "${BLUE}Starting schema validation...${NC}"
echo

# Validate JSON syntax
echo -e "${YELLOW}Step 1: Validating JSON syntax...${NC}"

if ! jq empty "$SCHEMA_FILE" 2>/dev/null; then
    echo -e "${RED}✗ Schema file contains invalid JSON${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Schema file has valid JSON syntax${NC}"

if ! jq empty "$DATA_FILE" 2>/dev/null; then
    echo -e "${RED}✗ Data file contains invalid JSON${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Data file has valid JSON syntax${NC}"

# Extract schema information
SCHEMA_NAME=$(jq -r '.name // "Unnamed Schema"' "$SCHEMA_FILE")
SCHEMA_VERSION=$(jq -r '.version // "1.0"' "$SCHEMA_FILE")
ORG_ID=$(jq -r '.org_id // ""' "$SCHEMA_FILE")

echo
echo -e "${YELLOW}Step 2: Analyzing schema...${NC}"
echo -e "Schema Name: ${BLUE}$SCHEMA_NAME${NC}"
echo -e "Schema Version: ${BLUE}$SCHEMA_VERSION${NC}"
echo -e "Organization ID: ${BLUE}$ORG_ID${NC}"

# Validate schema structure
echo
echo -e "${YELLOW}Step 3: Validating schema structure...${NC}"

# Check required fields
REQUIRED_FIELDS=("name" "version" "fields")
for field in "${REQUIRED_FIELDS[@]}"; do
    if ! jq -e ".$field" "$SCHEMA_FILE" > /dev/null; then
        echo -e "${RED}✗ Missing required field: $field${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All required schema fields present${NC}"

# Validate fields structure
FIELD_COUNT=$(jq '.fields | length' "$SCHEMA_FILE")
if [[ $FIELD_COUNT -gt 50 ]]; then
    echo -e "${RED}✗ Schema has too many fields ($FIELD_COUNT > 50)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Schema has $FIELD_COUNT fields (within limit)${NC}"

# Validate each field
FIELD_VALID=true
jq -r '.fields[] | @base64' "$SCHEMA_FILE" | while read -r field; do
    field_data=$(echo "$field" | base64 -d)
    field_name=$(echo "$field_data" | jq -r '.name // ""')
    field_type=$(echo "$field_data" | jq -r '.type // ""')
    field_required=$(echo "$field_data" | jq -r '.required // false')
    
    if [[ -z "$field_name" ]]; then
        echo -e "${RED}✗ Field with empty name found${NC}"
        FIELD_VALID=false
    elif [[ ${#field_name} -gt 256 ]]; then
        echo -e "${RED}✗ Field name too long: $field_name${NC}"
        FIELD_VALID=false
    fi
    
    if [[ -z "$field_type" ]]; then
        echo -e "${RED}✗ Field '$field_name' has no type${NC}"
        FIELD_VALID=false
    fi
done

if [[ "$FIELD_VALID" != true ]]; then
    exit 1
fi
echo -e "${GREEN}✓ All fields are properly structured${NC}"

# Validate data against schema
echo
echo -e "${YELLOW}Step 4: Validating data against schema...${NC}"

# Check required metadata
REQUIRED_METADATA=$(jq -r '.required_metadata[]?' "$SCHEMA_FILE" 2>/dev/null || echo "")
if [[ -n "$REQUIRED_METADATA" ]]; then
    echo "Checking required metadata..."
    while read -r meta_field; do
        if [[ -n "$meta_field" ]]; then
            if ! jq -e ".metadata.$meta_field" "$DATA_FILE" > /dev/null; then
                echo -e "${RED}✗ Missing required metadata: $meta_field${NC}"
                exit 1
            fi
            echo -e "${GREEN}✓ Required metadata present: $meta_field${NC}"
        fi
    done <<< "$REQUIRED_METADATA"
fi

# Check data fields against schema
echo "Checking data fields..."
DATA_FIELDS=$(jq -r '.encrypted_fields | keys[]' "$DATA_FILE" 2>/dev/null || echo "")
SCHEMA_FIELDS=$(jq -r '.fields[] | .name' "$SCHEMA_FILE" 2>/dev/null || echo "")

# Check for missing required fields
jq -r '.fields[] | select(.required == true) | .name' "$SCHEMA_FILE" 2>/dev/null | while read -r required_field; do
    if ! jq -e ".encrypted_fields.$required_field" "$DATA_FILE" > /dev/null; then
        echo -e "${RED}✗ Missing required field: $required_field${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Required field present: $required_field${NC}"
done

# Check for unexpected fields
echo "$DATA_FIELDS" | while read -r data_field; do
    if [[ -n "$data_field" ]]; then
        if ! echo "$SCHEMA_FIELDS" | grep -q "^$data_field$"; then
            echo -e "${YELLOW}⚠ Unexpected field in data: $data_field${NC}"
        fi
    fi
done

# Validate field types and sizes
echo -e "${YELLOW}Step 5: Validating field constraints...${NC}"

jq -r '.fields[] | @base64' "$SCHEMA_FILE" | while read -r field; do
    field_data=$(echo "$field" | base64 -d)
    field_name=$(echo "$field_data" | jq -r '.name')
    field_type=$(echo "$field_data" | jq -r '.type')
    min_length=$(echo "$field_data" | jq -r '.min_length // empty')
    max_length=$(echo "$field_data" | jq -r '.max_length // empty')
    
    # Check if field exists in data
    if jq -e ".encrypted_fields.$field_name" "$DATA_FILE" > /dev/null; then
        field_value=$(jq -r ".encrypted_fields.$field_name" "$DATA_FILE")
        
        # For encrypted fields, we can only check size
        if [[ "$field_type" == *"encrypted"* ]]; then
            # Remove quotes and check actual data length
            data_length=${#field_value}
            
            if [[ -n "$min_length" ]] && [[ $data_length -lt $min_length ]]; then
                echo -e "${RED}✗ Field '$field_name' too short: $data_length < $min_length${NC}"
                exit 1
            fi
            
            if [[ -n "$max_length" ]] && [[ $data_length -gt $max_length ]]; then
                echo -e "${RED}✗ Field '$field_name' too long: $data_length > $max_length${NC}"
                exit 1
            fi
            
            echo -e "${GREEN}✓ Field '$field_name' passes size validation${NC}"
        fi
    fi
done

# Calculate checksums
echo
echo -e "${YELLOW}Step 6: Generating checksums...${NC}"

DATA_HASH=$(jq -c . "$DATA_FILE" | sha256sum | cut -d' ' -f1)
SCHEMA_HASH=$(jq -c . "$SCHEMA_FILE" | sha256sum | cut -d' ' -f1)

echo -e "Data Hash: ${BLUE}$DATA_HASH${NC}"
echo -e "Schema Hash: ${BLUE}$SCHEMA_HASH${NC}"

# Generate validation report
echo
echo -e "${YELLOW}Step 7: Generating validation report...${NC}"

REPORT_FILE="validation_report_$(date +%Y%m%d_%H%M%S).json"
cat > "$REPORT_FILE" << EOF
{
  "validation_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "schema_file": "$SCHEMA_FILE",
  "data_file": "$DATA_FILE",
  "contract_address": "$CONTRACT_ADDRESS",
  "network": "$NETWORK",
  "schema": {
    "name": "$SCHEMA_NAME",
    "version": "$SCHEMA_VERSION",
    "org_id": "$ORG_ID",
    "hash": "$SCHEMA_HASH",
    "field_count": $FIELD_COUNT
  },
  "validation": {
    "status": "passed",
    "json_syntax_valid": true,
    "schema_structure_valid": true,
    "data_compliance": true,
    "field_constraints_satisfied": true
  },
  "data": {
    "hash": "$DATA_HASH",
    "required_metadata_present": true,
    "required_fields_present": true
  },
  "recommendations": [
    "Data is ready for submission to Stellar Privacy Analytics",
    "Consider encrypting sensitive fields before submission",
    "Monitor privacy budget consumption after submission"
  ]
}
EOF

echo -e "${GREEN}✓ Validation report generated: $REPORT_FILE${NC}"

# Network-specific instructions
echo
echo -e "${YELLOW}Step 8: Network submission instructions...${NC}"

case $NETWORK in
    "testnet")
        echo -e "${BLUE}Testnet Submission:${NC}"
        echo "1. Ensure you have XLM testnet funds"
        echo "2. Use the following command to submit:"
        echo "   stellar contract invoke --id $CONTRACT_ADDRESS --source YOUR_KEY --network testnet --function validate_payload --arg-file $REPORT_FILE"
        ;;
    "mainnet")
        echo -e "${BLUE}Mainnet Submission:${NC}"
        echo "⚠️  WARNING: You are about to submit to mainnet"
        echo "1. Ensure you have sufficient XLM funds"
        echo "2. Double-check all data before submission"
        echo "3. Use the following command to submit:"
        echo "   stellar contract invoke --id $CONTRACT_ADDRESS --source YOUR_KEY --network mainnet --function validate_payload --arg-file $REPORT_FILE"
        ;;
    "local")
        echo -e "${BLUE}Local Network Submission:${NC}"
        echo "1. Ensure your local Stellar node is running"
        echo "2. Use the following command to submit:"
        echo "   stellar contract invoke --id $CONTRACT_ADDRESS --source YOUR_KEY --network local --function validate_payload --arg-file $REPORT_FILE"
        ;;
    *)
        echo -e "${RED}Unknown network: $NETWORK${NC}"
        exit 1
        ;;
esac

echo
echo -e "${GREEN}🎉 Validation completed successfully!${NC}"
echo -e "${GREEN}Your data is ready for submission to Stellar Privacy Analytics.${NC}"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review the validation report: $REPORT_FILE"
echo "2. Encrypt any sensitive fields if not already encrypted"
echo "3. Submit to the Stellar network using the command above"
echo "4. Monitor your privacy budget dashboard after submission"
echo
