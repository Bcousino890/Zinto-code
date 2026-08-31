for file in /www/wwwroot/default/migrations/*.sql; do
  echo "Running $file..."
  docker exec -i zinto-postgres psql -U postgres -d zinto < "$file"
done
