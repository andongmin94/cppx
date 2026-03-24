cmake_minimum_required(VERSION 3.28)
project(sample-app VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(sample-app "${CMAKE_CURRENT_LIST_DIR}/../src/main.cpp")
include(CTest)
if(BUILD_TESTING)
  add_test(NAME sample-app_runs COMMAND sample-app)
endif()

install(TARGETS sample-app RUNTIME DESTINATION bin)

set(CPACK_PACKAGE_NAME "sample-app")
set(CPACK_PACKAGE_VENDOR "cppx")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_GENERATOR "ZIP")
include(CPack)
