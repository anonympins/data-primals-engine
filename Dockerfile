# Base image
FROM node:18

# Set working directory
WORKDIR /

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy application code
COPY . .

# Expose the application port
EXPOSE 7633

# Start the application
CMD ["npm", "run", "server"]