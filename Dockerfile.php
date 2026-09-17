FROM php:8.3-apache

# install-php-extensions instala binarios precompilados en vez de compilar
# gd/zip desde código fuente con docker-php-ext-install (mucho más rápido de buildear).
COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions zip gd pdo_mysql \
    && a2enmod rewrite

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-interaction --optimize-autoloader

# El docroot de Apache queda parado en la raíz del proyecto (no en app/api/)
# para que rutas relativas tipo __DIR__ . '/../../logs' sigan siendo válidas,
# igual que en el XAMPP original. nginx es quien expone solo /app/api/ hacia afuera.
COPY app ./app
COPY logs ./logs
COPY .htaccess ./.htaccess

ENV APACHE_DOCUMENT_ROOT=/var/www/html
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

EXPOSE 80
