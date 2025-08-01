# Base image
FROM node:18.18.2

# Set working directory
WORKDIR /

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy application code
COPY . .

# Expose the application port
EXPOSE 7633
